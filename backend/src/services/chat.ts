import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { conversations, creators, documents, messages } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient, LLMMessage, LLMUsage } from '../llm/base.js';
import { estimateCostUsd, toNumericString } from '../rag/cost.js';
import {
  type GuardrailDecision,
  type GuardrailFlag,
  detectInvestmentIntent,
} from '../rag/guardrails.js';
import type { PersonaCard } from '../rag/persona.js';
import { buildLLMArgs } from '../rag/prompt.js';
import { retrieveAndRerank } from '../rag/retrieval.js';
import { type RoutingDecision, type RoutingReason, pickModel } from '../rag/routing.js';
import type { Reranker } from '../rerank/base.js';
import { getPersonaCard } from './persona.js';

export interface ChatServices {
  embedder: Embedder;
  reranker: Reranker;
  llm: LLMClient;
}

export interface ChatLimits {
  llmModel: string;
  llmFallbackModel: string;
  maxTokens: number;
  retrievalTopK: number;
  rerankScoreThreshold: number;
  historyTurns: number;
  /** Force the routing decision (ops). Default: heuristics apply. */
  routingForce?: 'default' | 'fallback';
  /** Long-query cutoff in chars. Default 280. */
  routingLongQueryChars?: number;
  /** Min top rerank score to stay on the cheap model. Default 0.3. */
  routingLowConfidenceThreshold?: number;
}

export interface ProcessChatInput {
  creatorId: string;
  creatorSlug: string;
  query: string;
  conversationId?: string;
  userId?: string;
}

export interface ChatSource {
  chunkId: string;
  documentId: string;
  ordinal: number;
  title: string | null;
  score: number;
  rank: number;
}

export interface ProcessChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  content: string;
  fontes: ChatSource[];
  guardrailFlag: GuardrailFlag;
  /** Confidence + signals from the guardrail classifier (debug/analytics). */
  guardrail: GuardrailDecision;
  fallback: 'no_context' | null;
  model: string;
  /** Why this model was picked (default vs fallback) — useful for analytics. */
  routingReason: RoutingReason;
  usage: LLMUsage | null;
  costUsd: number;
  latencyMs: number;
}

const DEFAULT_LIMITS: ChatLimits = {
  llmModel: 'claude-haiku-4-5',
  llmFallbackModel: 'claude-sonnet-4-6',
  maxTokens: 800,
  retrievalTopK: 5,
  rerankScoreThreshold: 0.2,
  historyTurns: 6,
};

/**
 * End-to-end chat turn per `docs/05-rag-and-guardrails.md` §Pipeline:
 *   query → embedding → hybridSearch → rerank → (LLM | no_context)
 * Persists BOTH the user query and the assistant reply in `messages` with the
 * required audit fields (model, tokens, cost, latency, retrieved chunks).
 * Caller (route) resolves the creator from the slug and passes its id.
 */
export async function processChat(
  db: Database,
  services: ChatServices,
  limits: Partial<ChatLimits>,
  input: ProcessChatInput,
): Promise<ProcessChatResult> {
  const cfg: ChatLimits = { ...DEFAULT_LIMITS, ...limits };

  const persona = await getPersonaCard(db, input.creatorSlug);
  if (!persona) {
    throw new Error(`processChat: persona not set for ${input.creatorSlug}`);
  }

  // Stage-1 guardrail (rules) — runs before any spend. E3.2 will use the
  // flag to force educational mode; E3.3 adds the post-gen filter.
  const guardrail = detectInvestmentIntent(input.query);
  if (guardrail.flag) {
    console.info(
      `[chat] guardrail slug=${input.creatorSlug} flag=${guardrail.flag} ` +
        `confidence=${guardrail.confidence} signals=${guardrail.signals.join(',')}`,
    );
  }

  const conversationId = await ensureConversation(db, {
    conversationId: input.conversationId,
    creatorId: input.creatorId,
    userId: input.userId,
  });

  const historyOrdered = await loadHistory(db, conversationId, cfg.historyTurns);

  const userInsert = await db
    .insert(messages)
    .values({
      conversationId,
      creatorId: input.creatorId,
      role: 'user',
      content: input.query,
    })
    .returning({ id: messages.id });
  const userMessageId = userInsert[0]?.id;
  if (!userMessageId) {
    throw new Error('processChat: failed to insert user message');
  }

  const [queryEmbedding] = await services.embedder.embed([input.query]);
  if (!queryEmbedding) {
    throw new Error('processChat: embedder returned no vectors');
  }

  const retrieval = await retrieveAndRerank(db, services.reranker, {
    creatorId: input.creatorId,
    query: input.query,
    queryEmbedding,
    topK: cfg.retrievalTopK,
    rerankScoreThreshold: cfg.rerankScoreThreshold,
  });

  const routing = pickModel(
    { query: input.query, rerankScores: retrieval.hits.map((h) => h.rerankScore) },
    {
      defaultModel: cfg.llmModel,
      fallbackModel: cfg.llmFallbackModel,
      longQueryChars: cfg.routingLongQueryChars,
      lowConfidenceThreshold: cfg.routingLowConfidenceThreshold,
      force: cfg.routingForce,
    },
  );

  if (retrieval.fallback !== 'no_context') {
    logRouting(routing, input.creatorSlug);
  }

  const assistant = await runAssistantTurn({
    persona,
    historyOrdered,
    query: input.query,
    retrieval,
    routing,
    guardrail,
    db,
    llm: services.llm,
    cfg,
  });

  const assistantInsert = await db
    .insert(messages)
    .values({
      conversationId,
      creatorId: input.creatorId,
      role: 'assistant',
      content: assistant.content,
      model: assistant.usage ? assistant.model : null,
      inputTokens: assistant.usage?.inputTokens ?? null,
      outputTokens: assistant.usage?.outputTokens ?? null,
      costUsd: assistant.usage ? toNumericString(assistant.costUsd) : null,
      latencyMs: assistant.usage ? assistant.latencyMs : null,
      retrievedChunks:
        assistant.fontes.length > 0
          ? assistant.fontes.map((f) => ({
              chunkId: f.chunkId,
              documentId: f.documentId,
              score: f.score,
              rank: f.rank,
            }))
          : null,
      guardrailFlag: guardrail.flag,
    })
    .returning({ id: messages.id });
  const assistantMessageId = assistantInsert[0]?.id;
  if (!assistantMessageId) {
    throw new Error('processChat: failed to insert assistant message');
  }

  return {
    conversationId,
    userMessageId,
    assistantMessageId,
    content: assistant.content,
    fontes: assistant.fontes,
    guardrailFlag: guardrail.flag,
    guardrail,
    fallback: assistant.fallback,
    model: assistant.model,
    routingReason: routing.reason,
    usage: assistant.usage,
    costUsd: assistant.costUsd,
    latencyMs: assistant.latencyMs,
  };
}

function logRouting(decision: RoutingDecision, slug: string) {
  const s = decision.signals;
  console.info(
    `[chat] slug=${slug} model=${decision.model} reason=${decision.reason} ` +
      `query_chars=${s.queryChars} question_marks=${s.questionMarks} top_score=${s.topRerankScore?.toFixed(3) ?? 'n/a'}`,
  );
}

async function ensureConversation(
  db: Database,
  args: { conversationId?: string; creatorId: string; userId?: string },
): Promise<string> {
  if (args.conversationId) {
    const [existing] = await db
      .select({ id: conversations.id, creatorId: conversations.creatorId })
      .from(conversations)
      .where(eq(conversations.id, args.conversationId))
      .limit(1);
    if (!existing) {
      throw new Error(`processChat: conversation not found: ${args.conversationId}`);
    }
    if (existing.creatorId !== args.creatorId) {
      throw new Error(
        `processChat: conversation ${args.conversationId} belongs to a different creator`,
      );
    }
    return existing.id;
  }
  const [created] = await db
    .insert(conversations)
    .values({ creatorId: args.creatorId, userId: args.userId ?? null })
    .returning({ id: conversations.id });
  if (!created) throw new Error('processChat: failed to create conversation');
  return created.id;
}

async function loadHistory(
  db: Database,
  conversationId: string,
  turns: number,
): Promise<LLMMessage[]> {
  if (turns <= 0) return [];
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(turns);
  return rows
    .reverse()
    .filter(
      (r): r is { role: 'user' | 'assistant'; content: string } =>
        r.role === 'user' || r.role === 'assistant',
    )
    .map((r) => ({ role: r.role, content: r.content }));
}

interface AssistantTurnArgs {
  persona: PersonaCard;
  historyOrdered: LLMMessage[];
  query: string;
  retrieval: Awaited<ReturnType<typeof retrieveAndRerank>>;
  routing: RoutingDecision;
  guardrail: GuardrailDecision;
  db: Database;
  llm: LLMClient;
  cfg: ChatLimits;
}

interface AssistantTurnResult {
  content: string;
  fontes: ChatSource[];
  fallback: 'no_context' | null;
  model: string;
  usage: LLMUsage | null;
  costUsd: number;
  latencyMs: number;
}

async function runAssistantTurn(args: AssistantTurnArgs): Promise<AssistantTurnResult> {
  if (args.retrieval.fallback === 'no_context') {
    return {
      content: `Não tenho isso registrado nos conteúdos de ${args.persona.name}.`,
      fontes: [],
      fallback: 'no_context',
      model: args.routing.model,
      usage: null,
      costUsd: 0,
      latencyMs: 0,
    };
  }

  const titles = await getDocumentTitles(
    args.db,
    args.retrieval.hits.map((h) => h.documentId),
  );
  const fontes: ChatSource[] = args.retrieval.hits.map((h, i) => ({
    chunkId: h.chunkId,
    documentId: h.documentId,
    ordinal: h.ordinal,
    title: titles.get(h.documentId) ?? null,
    score: h.rerankScore,
    rank: i,
  }));

  const llmArgs = buildLLMArgs({
    personaCard: args.persona,
    query: args.query,
    chunks: args.retrieval.hits.map((h) => ({
      text: h.text,
      title: titles.get(h.documentId) ?? undefined,
    })),
    history: args.historyOrdered,
    guardrail: args.guardrail,
    model: args.routing.model,
    maxTokens: args.cfg.maxTokens,
  });

  const start = Date.now();
  const llmResult = await args.llm.complete(llmArgs);
  const latencyMs = Date.now() - start;

  const costUsd = estimateCostUsd(llmResult.model || args.routing.model, llmResult.usage);

  return {
    content: llmResult.content,
    fontes,
    fallback: null,
    model: llmResult.model || args.routing.model,
    usage: llmResult.usage,
    costUsd,
    latencyMs,
  };
}

async function getDocumentTitles(db: Database, ids: string[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(inArray(documents.id, unique));
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Helper for the route layer to validate creator existence. */
export async function resolveCreatorBySlug(
  db: Database,
  slug: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: creators.id })
    .from(creators)
    .where(eq(creators.slug, slug))
    .limit(1);
  return row ?? null;
}

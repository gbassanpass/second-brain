import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { conversations, creators, documents, messages } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient, LLMMessage, LLMUsage } from '../llm/base.js';
import { estimateCostUsd, toNumericString } from '../rag/cost.js';
import {
  type GuardrailDecision,
  type GuardrailFlag,
  detectDirectRecommendation,
  detectInvestmentIntent,
  detectMissingCitations,
} from '../rag/guardrails.js';
import type { PersonaCard } from '../rag/persona.js';
import {
  buildCitationRetryArgs,
  buildExtrapolationArgs,
  buildLLMArgs,
  buildReinforcedRetryArgs,
  buildSafeEducationalReply,
  buildSmalltalkArgs,
} from '../rag/prompt.js';
import { type RetrieveAndRerankResult, retrieveAndRerank } from '../rag/retrieval.js';
import { type RoutingDecision, type RoutingReason, pickModel } from '../rag/routing.js';
import type { Reranker } from '../rerank/base.js';
import { formatSubgraph, retrieveSubgraph, retrieveTopPrinciples } from './kg-retrieve.js';
import { type Leniency, getLeniency, minFactsToExtrapolate } from './leniency.js';
import { getPersonaCard } from './persona.js';
import { isSmalltalk } from './smalltalk.js';

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
  /** GraphRAG (F1.5.2): inject relevant KG facts into the prompt. Default true. */
  graphRetrievalEnabled?: boolean;
  /** Max KG facts injected per turn. Default 12. */
  graphMaxFacts?: number;
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
  /** Permalink to the original content (e.g. the Instagram post), when known. */
  url: string | null;
  /** Short excerpt of the cited chunk for the citation popover (F1.5.2). */
  snippet: string;
  score: number;
  rank: number;
}

/**
 * What the post-generation filter did to the reply.
 *   - `pass`: every check was clean.
 *   - `regenerated`: first attempt violated, second attempt passed.
 *   - `replaced`: both attempts violated → canned reply served.
 */
export type PostFilterAction = 'pass' | 'regenerated' | 'replaced';

/**
 * Which post-filter pass triggered.
 *   - `recommendation`: direct buy/sell/allocate language (E3.3).
 *   - `missing_citation`: substantive reply with no [N] grounding (E3.4).
 */
export type PostFilterCategory = 'recommendation' | 'missing_citation';

export interface PostFilterDecision {
  action: PostFilterAction;
  /** `null` only when `action='pass'`. */
  category: PostFilterCategory | null;
  /** Pattern names hit across attempts (e.g. ["imperative_asset","you_should"]). */
  signals: string[];
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
  /** Post-generation filter decision (E3.3). */
  postFilter: PostFilterDecision;
  fallback: 'no_context' | null;
  /** True when the reply was inferred from KG principles, not direct content (F1.5.3). */
  extrapolated: boolean;
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
  graphRetrievalEnabled: true,
  graphMaxFacts: 12,
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

  // Smalltalk (A): greetings/identity/thanks answer in persona without
  // retrieval — skips the embed+search spend AND the no_context refusal. Never
  // for investment-flagged turns (those keep the educational pipeline).
  const smalltalk = !guardrail.flag && isSmalltalk(input.query);

  const retrieval: RetrieveAndRerankResult = smalltalk
    ? { hits: [], fallback: 'no_context' }
    : await (async () => {
        const [queryEmbedding] = await services.embedder.embed([input.query]);
        if (!queryEmbedding) {
          throw new Error('processChat: embedder returned no vectors');
        }
        return retrieveAndRerank(db, services.reranker, {
          creatorId: input.creatorId,
          query: input.query,
          queryEmbedding,
          topK: cfg.retrievalTopK,
          rerankScoreThreshold: cfg.rerankScoreThreshold,
        });
      })();

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

  const leniency = await getLeniency(db, input.creatorId);
  const assistant = await runAssistantTurn({
    persona,
    creatorId: input.creatorId,
    leniency,
    historyOrdered,
    query: input.query,
    retrieval,
    routing,
    guardrail,
    db,
    llm: services.llm,
    cfg,
    smalltalk,
  });

  // Defense in depth: if the post-filter caught a recommendation the
  // pre-classifier missed, still log the message as 'investment'. The
  // missing-citation path (E3.4) is NOT investment — leave the flag null.
  const effectiveGuardrailFlag: GuardrailFlag =
    guardrail.flag ?? (assistant.postFilter.category === 'recommendation' ? 'investment' : null);

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
      guardrailFlag: effectiveGuardrailFlag,
      leniency,
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
    guardrailFlag: effectiveGuardrailFlag,
    guardrail,
    postFilter: assistant.postFilter,
    fallback: assistant.fallback,
    extrapolated: assistant.extrapolated ?? false,
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
  creatorId: string;
  leniency: Leniency;
  historyOrdered: LLMMessage[];
  query: string;
  retrieval: Awaited<ReturnType<typeof retrieveAndRerank>>;
  routing: RoutingDecision;
  guardrail: GuardrailDecision;
  db: Database;
  llm: LLMClient;
  cfg: ChatLimits;
  /** When true, answer as casual conversation (no retrieval, no refusal). */
  smalltalk: boolean;
}

interface AssistantTurnResult {
  content: string;
  fontes: ChatSource[];
  fallback: 'no_context' | null;
  /** True when the reply was inferred from KG principles (F1.5.3). */
  extrapolated?: boolean;
  model: string;
  usage: LLMUsage | null;
  costUsd: number;
  latencyMs: number;
  postFilter: PostFilterDecision;
}

/**
 * Extrapolation turn (F1.5.3): answer from the creator's principles when there
 * is no direct content. No chunks → no citation filter; the CVM recommendation
 * guardrail still applies (regenerate → safe reply).
 */
async function runExtrapolation(
  args: AssistantTurnArgs,
  graphFacts: string[],
): Promise<AssistantTurnResult> {
  const llmArgs = buildExtrapolationArgs({
    personaCard: args.persona,
    query: args.query,
    graphFacts,
    history: args.historyOrdered,
    guardrail: args.guardrail,
    model: args.routing.model,
    maxTokens: args.cfg.maxTokens,
  });
  const start = Date.now();
  const first = await args.llm.complete(llmArgs);
  let latencyMs = Date.now() - start;
  const modelOf = (r: typeof first) => r.model || args.routing.model;

  const rec = detectDirectRecommendation(first.content);
  if (!rec.violated) {
    return {
      content: first.content,
      fontes: [],
      fallback: null,
      extrapolated: true,
      model: modelOf(first),
      usage: first.usage,
      costUsd: estimateCostUsd(modelOf(first), first.usage),
      latencyMs,
      postFilter: { action: 'pass', category: null, signals: [] },
    };
  }

  const retryStart = Date.now();
  const second = await args.llm.complete(buildReinforcedRetryArgs(llmArgs));
  latencyMs += Date.now() - retryStart;
  const rec2 = detectDirectRecommendation(second.content);
  const usage = sumUsage(first.usage, second.usage);
  const costUsd =
    estimateCostUsd(modelOf(first), first.usage) + estimateCostUsd(modelOf(second), second.usage);
  return {
    content: rec2.violated ? buildSafeEducationalReply(args.persona.name) : second.content,
    fontes: [],
    fallback: null,
    extrapolated: true,
    model: modelOf(second),
    usage,
    costUsd,
    latencyMs,
    postFilter: {
      action: rec2.violated ? 'replaced' : 'regenerated',
      category: 'recommendation',
      signals: Array.from(new Set([...rec.matches, ...rec2.matches])),
    },
  };
}

/**
 * Smalltalk turn (A): greeting/identity/thanks answered in persona, no chunks,
 * no refusal. CVM guardrail isn't applicable here (callers only set
 * `smalltalk` when the investment classifier didn't flag the query).
 */
async function runSmalltalk(args: AssistantTurnArgs): Promise<AssistantTurnResult> {
  const llmArgs = buildSmalltalkArgs({
    personaCard: args.persona,
    query: args.query,
    history: args.historyOrdered,
    model: args.routing.model,
    maxTokens: Math.min(args.cfg.maxTokens, 300),
  });
  const start = Date.now();
  const res = await args.llm.complete(llmArgs);
  const model = res.model || args.routing.model;
  return {
    content: res.content,
    fontes: [],
    fallback: null,
    extrapolated: false,
    model,
    usage: res.usage,
    costUsd: estimateCostUsd(model, res.usage),
    latencyMs: Date.now() - start,
    postFilter: { action: 'pass', category: null, signals: [] },
  };
}

async function runAssistantTurn(args: AssistantTurnArgs): Promise<AssistantTurnResult> {
  if (args.smalltalk) return runSmalltalk(args);
  if (args.retrieval.fallback === 'no_context') {
    // F1.5.3/F1.5.4 — extrapolation: no direct excerpt, but if the graph has
    // enough principles (per the creator's leniency), reason from them instead
    // of refusing. `strict` never extrapolates.
    const minFacts = minFactsToExtrapolate(args.leniency);
    if (args.cfg.graphRetrievalEnabled !== false && minFacts !== null) {
      const maxFacts = args.cfg.graphMaxFacts ?? 12;
      let facts = await retrieveSubgraph(args.db, {
        creatorId: args.creatorId,
        query: args.query,
        chunkIds: [],
        maxFacts,
      });
      // Genuinely-new topic: the question matched no entity in the graph, so
      // there are no query-specific facts. Fall back to the creator's general
      // METHOD (principles/heuristics) so it reasons "pelo meu jeito de pensar…"
      // instead of refusing — without inventing facts about the topic (F1.5.4).
      if (facts.length < minFacts) {
        facts = await retrieveTopPrinciples(args.db, { creatorId: args.creatorId, maxFacts });
      }
      if (facts.length >= minFacts) {
        return runExtrapolation(args, formatSubgraph(facts));
      }
    }
    return {
      content: `Não tenho isso registrado nos conteúdos de ${args.persona.name}.`,
      fontes: [],
      fallback: 'no_context',
      model: args.routing.model,
      usage: null,
      costUsd: 0,
      latencyMs: 0,
      postFilter: { action: 'pass', category: null, signals: [] },
    };
  }

  const meta = await getDocumentMeta(
    args.db,
    args.retrieval.hits.map((h) => h.documentId),
  );
  const fontes: ChatSource[] = args.retrieval.hits.map((h, i) => ({
    chunkId: h.chunkId,
    documentId: h.documentId,
    ordinal: h.ordinal,
    title: meta.get(h.documentId)?.title ?? null,
    url: meta.get(h.documentId)?.url ?? null,
    snippet: h.text.replace(/\s+/g, ' ').trim().slice(0, 280),
    score: h.rerankScore,
    rank: i,
  }));

  // GraphRAG (F1.5.2): augment the prompt with the relevant sub-graph — the
  // creator's principles/connections around this question — so the clone
  // reasons in character, not just from isolated snippets.
  let graphFacts: string[] | undefined;
  if (args.cfg.graphRetrievalEnabled !== false) {
    const subgraph = await retrieveSubgraph(args.db, {
      creatorId: args.creatorId,
      query: args.query,
      chunkIds: args.retrieval.hits.map((h) => h.chunkId),
      maxFacts: args.cfg.graphMaxFacts ?? 12,
    });
    if (subgraph.length > 0) graphFacts = formatSubgraph(subgraph);
  }

  const llmArgs = buildLLMArgs({
    personaCard: args.persona,
    query: args.query,
    chunks: args.retrieval.hits.map((h) => ({
      text: h.text,
      title: meta.get(h.documentId)?.title ?? undefined,
    })),
    graphFacts,
    history: args.historyOrdered,
    guardrail: args.guardrail,
    model: args.routing.model,
    maxTokens: args.cfg.maxTokens,
  });

  const start = Date.now();
  const first = await args.llm.complete(llmArgs);
  let latencyMs = Date.now() - start;
  const modelOf = (r: typeof first) => r.model || args.routing.model;

  // Pass 1 — recommendation post-filter (E3.3).
  const recFirst = detectDirectRecommendation(first.content);
  if (recFirst.violated) {
    console.warn(
      `[chat] post-filter category=recommendation action=regenerate signals=${recFirst.matches.join(',')}`,
    );
    const retryStart = Date.now();
    const second = await args.llm.complete(buildReinforcedRetryArgs(llmArgs));
    latencyMs += Date.now() - retryStart;
    const recSecond = detectDirectRecommendation(second.content);
    const usage = sumUsage(first.usage, second.usage);
    const cost =
      estimateCostUsd(modelOf(first), first.usage) + estimateCostUsd(modelOf(second), second.usage);
    if (!recSecond.violated) {
      return {
        content: second.content,
        fontes,
        fallback: null,
        model: modelOf(second),
        usage,
        costUsd: cost,
        latencyMs,
        postFilter: {
          action: 'regenerated',
          category: 'recommendation',
          signals: recFirst.matches,
        },
      };
    }
    console.error(
      `[chat] post-filter category=recommendation action=replaced first=${recFirst.matches.join(',')} second=${recSecond.matches.join(',')}`,
    );
    return {
      content: buildSafeEducationalReply(args.persona.name),
      fontes,
      fallback: null,
      model: modelOf(second),
      usage,
      costUsd: cost,
      latencyMs,
      postFilter: {
        action: 'replaced',
        category: 'recommendation',
        signals: Array.from(new Set([...recFirst.matches, ...recSecond.matches])),
      },
    };
  }

  // Pass 2 — missing-citation post-filter (E3.4). Skipped on investment
  // turns because the educational reply is allowed to redirect without
  // citing every claim.
  if (args.guardrail.flag === null) {
    const citFirst = detectMissingCitations(first.content, { hadChunks: fontes.length > 0 });
    if (citFirst.violated) {
      console.warn('[chat] post-filter category=missing_citation action=regenerate');
      const retryStart = Date.now();
      const second = await args.llm.complete(buildCitationRetryArgs(llmArgs));
      latencyMs += Date.now() - retryStart;
      const citSecond = detectMissingCitations(second.content, { hadChunks: fontes.length > 0 });
      const usage = sumUsage(first.usage, second.usage);
      const cost =
        estimateCostUsd(modelOf(first), first.usage) +
        estimateCostUsd(modelOf(second), second.usage);
      if (!citSecond.violated) {
        return {
          content: second.content,
          fontes,
          fallback: null,
          model: modelOf(second),
          usage,
          costUsd: cost,
          latencyMs,
          postFilter: {
            action: 'regenerated',
            category: 'missing_citation',
            signals: ['no_citation_marker'],
          },
        };
      }
      // Anti-hallucination fallback: hand back the same canned refusal the
      // no_context path serves. Clear `fontes` so the message log doesn't
      // imply we stood behind any chunk.
      console.error(
        '[chat] post-filter category=missing_citation action=replaced — serving no_context canned',
      );
      return {
        content: `Não tenho isso registrado nos conteúdos de ${args.persona.name}.`,
        fontes: [],
        fallback: null,
        model: modelOf(second),
        usage,
        costUsd: cost,
        latencyMs,
        postFilter: {
          action: 'replaced',
          category: 'missing_citation',
          signals: ['no_citation_marker'],
        },
      };
    }
  }

  // All passes clean.
  return {
    content: first.content,
    fontes,
    fallback: null,
    model: modelOf(first),
    usage: first.usage,
    costUsd: estimateCostUsd(modelOf(first), first.usage),
    latencyMs,
    postFilter: { action: 'pass', category: null, signals: [] },
  };
}

function sumUsage(a: LLMUsage | null, b: LLMUsage | null): LLMUsage | null {
  if (!a && !b) return null;
  const left = a ?? { inputTokens: 0, outputTokens: 0 };
  const right = b ?? { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadInputTokens: addOptional(left.cacheReadInputTokens, right.cacheReadInputTokens),
    cacheCreationInputTokens: addOptional(
      left.cacheCreationInputTokens,
      right.cacheCreationInputTokens,
    ),
  };
}

function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

interface DocMeta {
  title: string | null;
  url: string | null;
}

async function getDocumentMeta(db: Database, ids: string[]): Promise<Map<string, DocMeta>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: documents.id, title: documents.title, url: documents.url })
    .from(documents)
    .where(inArray(documents.id, unique));
  return new Map(rows.map((r) => [r.id, { title: r.title, url: r.url }]));
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

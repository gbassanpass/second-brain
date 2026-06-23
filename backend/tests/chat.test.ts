import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, conversations, creators, documents, messages } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { FakeLLM } from '../src/llm/fake.js';
import { estimateCostUsd } from '../src/rag/cost.js';
import { type PersonaCard, personaCardSchema } from '../src/rag/persona.js';
import { FakeReranker } from '../src/rerank/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { setPersonaCard } from '../src/services/persona.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

async function probeDb(url: string): Promise<boolean> {
  const client = postgres(url, { connect_timeout: 1, max: 1, idle_timeout: 1 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

const dbReachable = await probeDb(DB_URL);
if (!dbReachable) {
  console.warn('[chat] skipped — DATABASE_URL not reachable (run `make up`).');
}

const PERSONA: PersonaCard = personaCardSchema.parse({
  name: 'Test Persona',
  one_liner: 'persona de teste',
  voice: ['didático'],
  frameworks: ['quem ganha o quê'],
  do: ['explicar acontecimentos sem viés'],
  dont: ['recomendar investimento'],
});

const CHUNK_TEXTS = [
  'Sobre eleições brasileiras, a candidatura é dividida por dois polos políticos.',
  'A geopolítica do petróleo no Oriente Médio molda os preços do barril.',
  'O futebol nordestino tem temporada vibrante em 2026.',
];

describe.skipIf(!dbReachable)('POST /api/chat — orchestrator (integration)', () => {
  const slug = `test-chat-${randomUUID().slice(0, 8)}`;
  const embedder = new FakeEmbedder({ dimensions: 1536 });
  const reranker = new FakeReranker();
  let llm: FakeLLM;
  let creatorId = '';
  let chunkIds: string[] = [];

  const buildApp = (overrides: Partial<ReturnType<typeof baseConfig>> = {}) =>
    createApp({
      getDb: () => getDb(DB_URL),
      getChatServices: () => ({ embedder, reranker, llm }),
      getChatConfig: () => ({ ...baseConfig(), ...overrides }),
      enqueueSync: async () => ({ jobId: 'noop' }),
    });

  const baseConfig = (): {
    LLM_DEFAULT_MODEL: string;
    LLM_FALLBACK_MODEL: string;
    MAX_TOKENS_PER_REPLY: number;
    RETRIEVAL_TOP_K: number;
    RERANK_SCORE_THRESHOLD: number;
    LLM_ROUTING_FORCE: 'default' | 'fallback' | undefined;
    LLM_ROUTING_LONG_QUERY_CHARS: number;
    LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD: number;
  } => ({
    LLM_DEFAULT_MODEL: 'claude-haiku-4-5',
    LLM_FALLBACK_MODEL: 'claude-sonnet-4-6',
    MAX_TOKENS_PER_REPLY: 200,
    RETRIEVAL_TOP_K: 3,
    // Permissive threshold so FakeReranker's Jaccard scores pass on
    // single-term queries; the no_context path uses a separate app.
    RERANK_SCORE_THRESHOLD: 0,
    LLM_ROUTING_FORCE: undefined,
    LLM_ROUTING_LONG_QUERY_CHARS: 280,
    LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD: 0.3,
  });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Chat Creator');
    creatorId = creator.id;
    await setPersonaCard(db, slug, PERSONA);

    // Seed 1 document + 3 chunks with FakeEmbedder vectors (so vector search
    // returns something deterministic).
    const [doc] = await db
      .insert(documents)
      .values({
        creatorId,
        rawText: CHUNK_TEXTS.join(' '),
        contentHash: 'a'.repeat(64),
        title: 'fixture',
        kind: 'article',
      })
      .returning({ id: documents.id });
    if (!doc) throw new Error('seed doc failed');

    const embeddings = await embedder.embed(CHUNK_TEXTS);
    const rows = await db
      .insert(chunks)
      .values(
        CHUNK_TEXTS.map((text, i) => ({
          creatorId,
          documentId: doc.id,
          ordinal: i,
          text,
          embedding: embeddings[i],
          tokenCount: Math.ceil(text.length / 4),
        })),
      )
      .returning({ id: chunks.id });
    chunkIds = rows.map((r) => r.id);
  }, 30000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(messages).where(eq(messages.creatorId, creatorId));
      await db.delete(conversations).where(eq(conversations.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('happy path: returns the LLM answer with fontes and persists both turns', async () => {
    llm = new FakeLLM();
    // Force default model so this test is about persistence, not routing.
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversationId: string;
      messageId: string;
      content: string;
      fontes: Array<{ chunkId: string; documentId: string; title: string | null; rank: number }>;
      fallback: 'no_context' | null;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      costUsd: number;
      latencyMs: number;
    };
    expect(body.fallback).toBeNull();
    expect(body.content).toContain('eleições brasileiras'); // FakeLLM echoes the user message
    expect(body.fontes.length).toBeGreaterThan(0);
    expect(body.fontes[0]?.chunkId).toBe(chunkIds[0]);
    expect(body.fontes[0]?.title).toBe('fixture');
    expect(body.usage.inputTokens).toBeGreaterThan(0);
    expect(body.costUsd).toBeGreaterThan(0);
    expect(body.model).toBe('claude-haiku-4-5');

    const db = getDb(DB_URL);
    const turns = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, body.conversationId))
      .orderBy(messages.createdAt);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.role).toBe('user');
    expect(turns[0]?.content).toBe('eleições brasileiras');
    expect(turns[1]?.role).toBe('assistant');
    expect(turns[1]?.id).toBe(body.messageId);
    expect(turns[1]?.model).toBe('claude-haiku-4-5');
    expect(turns[1]?.inputTokens).toBeGreaterThan(0);
    expect(turns[1]?.outputTokens).toBeGreaterThan(0);
    expect(turns[1]?.costUsd).toMatch(/^\d+\.\d{5}$/);
    expect(turns[1]?.latencyMs).not.toBeNull();
    const stored = turns[1]?.retrievedChunks as Array<{ chunkId: string; rank: number }>;
    expect(stored).toBeInstanceOf(Array);
    expect(stored[0]?.chunkId).toBe(chunkIds[0]);
  });

  it('continues an existing conversation and passes history to the LLM', async () => {
    llm = new FakeLLM();
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const first = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    const firstBody = (await first.json()) as { conversationId: string };

    const second = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorSlug: slug,
        query: 'e o petróleo?',
        conversationId: firstBody.conversationId,
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { conversationId: string };
    expect(secondBody.conversationId).toBe(firstBody.conversationId);

    // History should have been forwarded — FakeLLM's 2nd call must see > 1 message.
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.messages.length).toBeGreaterThan(1);
    expect(llm.calls[1]?.cacheSystemPrompt).toBe(true);
    expect(llm.calls[0]?.system).toBe(llm.calls[1]?.system);
  });

  it('flags investment intent, forces educational mode in the prompt, and persists guardrail_flag', async () => {
    llm = new FakeLLM();
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorSlug: slug,
        query: 'Que cripto eu devo comprar agora?',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messageId: string;
      guardrailFlag: string | null;
      guardrail: { flag: string | null; confidence: string; signals: string[] };
    };
    expect(body.guardrailFlag).toBe('investment');
    expect(body.guardrail.confidence).toBe('high');
    expect(body.guardrail.signals.some((s) => s.startsWith('action:'))).toBe(true);

    // Educational mode preamble must have hit the LLM's user message.
    const lastUser = llm.calls[0]?.messages.at(-1)?.content ?? '';
    expect(lastUser).toContain('MODO EDUCACIONAL OBRIGATÓRIO');
    expect(lastUser).toContain('Pergunta: Que cripto eu devo comprar agora?');

    const db = getDb(DB_URL);
    const [row] = await db
      .select({ guardrailFlag: messages.guardrailFlag })
      .from(messages)
      .where(eq(messages.id, body.messageId));
    expect(row?.guardrailFlag).toBe('investment');
  });

  it('does not flag a non-financial query (no preamble, guardrailFlag stays null)', async () => {
    llm = new FakeLLM();
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: 'O que ele pensa sobre eleições?' }),
    });
    const body = (await res.json()) as { guardrailFlag: string | null };
    expect(body.guardrailFlag).toBeNull();
    const lastUser = llm.calls[0]?.messages.at(-1)?.content ?? '';
    expect(lastUser).not.toContain('MODO EDUCACIONAL');
  });

  it('routes to the fallback model for multi-question queries (and logs it)', async () => {
    llm = new FakeLLM();
    const app = buildApp();
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorSlug: slug,
        query: 'O que ele pensa sobre eleições? E sobre o petróleo?',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      model: string;
      routingReason: string;
    };
    expect(body.routingReason).toBe('multi_question');
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(llm.calls[0]?.model).toBe('claude-sonnet-4-6');
  });

  it('routes to the fallback model for long queries', async () => {
    llm = new FakeLLM();
    const app = buildApp();
    const long = `${'eleições brasileiras com muito contexto e nuance '.repeat(20)}.`;
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: long }),
    });
    const body = (await res.json()) as { routingReason: string };
    expect(body.routingReason).toBe('long_query');
  });

  it('returns the "não tenho isso registrado" fallback when nothing clears the threshold', async () => {
    llm = new FakeLLM();
    const app = buildApp({ RERANK_SCORE_THRESHOLD: 1.01 });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: 'qualquer coisa' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      fallback: 'no_context' | null;
      fontes: unknown[];
      usage: unknown;
      costUsd: number;
    };
    expect(body.fallback).toBe('no_context');
    expect(body.content).toContain('Não tenho isso registrado');
    expect(body.fontes).toEqual([]);
    expect(body.usage).toBeNull();
    expect(body.costUsd).toBe(0);
    expect(llm.calls).toHaveLength(0); // never touched the LLM

    const db = getDb(DB_URL);
    const [lastAssistant] = await db
      .select({ content: messages.content, retrievedChunks: messages.retrievedChunks })
      .from(messages)
      .where(eq(messages.creatorId, creatorId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    expect(lastAssistant?.content).toContain('Não tenho isso registrado');
    expect(lastAssistant?.retrievedChunks).toBeNull();
  });

  it('returns 400 / 404 for invalid payloads and unknown creators', async () => {
    llm = new FakeLLM();
    const app = buildApp();
    expect(
      (
        await app.request('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ creatorSlug: slug, query: '' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ creatorSlug: '__unknown__', query: 'oi' }),
        })
      ).status,
    ).toBe(404);
  });

  it('rejects a conversation belonging to a different creator with 403', async () => {
    llm = new FakeLLM();
    const db = getDb(DB_URL);
    const other = await ensureCreatorBySlug(
      db,
      `test-chat-other-${randomUUID().slice(0, 8)}`,
      'Other',
    );
    await setPersonaCard(db, other.slug, PERSONA);
    const [otherConv] = await db
      .insert(conversations)
      .values({ creatorId: other.id })
      .returning({ id: conversations.id });
    if (!otherConv) throw new Error('seed otherConv failed');

    const app = buildApp();
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorSlug: slug,
        query: 'oi',
        conversationId: otherConv.id,
      }),
    });
    expect(res.status).toBe(403);

    await db.delete(conversations).where(eq(conversations.id, otherConv.id));
    await db.delete(creators).where(eq(creators.id, other.id));
  });
});

describe('estimateCostUsd', () => {
  it('charges regular Anthropic Haiku rates per million tokens', () => {
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.25 + 1.25, 6);
  });

  it('applies the 10% cache-read modifier', () => {
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.025, 6);
  });

  it('applies the 125% cache-write modifier', () => {
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.3125, 6);
  });

  it('uses Sonnet pricing when the model name says sonnet', () => {
    const cost = estimateCostUsd('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3 + 15, 6);
  });
});

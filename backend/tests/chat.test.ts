import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import {
  chunks,
  conversations,
  creators,
  documents,
  kgEntities,
  kgRelations,
  messages,
  subscriptions,
  users,
} from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { FakeLLM } from '../src/llm/fake.js';
import { estimateCostUsd } from '../src/rag/cost.js';
import { type PersonaCard, personaCardSchema } from '../src/rag/persona.js';
import { FakeReranker } from '../src/rerank/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { setPersonaCard } from '../src/services/persona.js';

const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

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
  // Auth (E6.3): chat now requires a logged-in subscriber with active access.
  let authId = '';
  let userId = '';
  let token = '';

  const buildApp = (overrides: Partial<ReturnType<typeof baseConfig>> = {}) =>
    createApp({
      getDb: () => getDb(DB_URL),
      jwtSecret: JWT_SECRET,
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

    // Provision a subscriber (auth.users trigger → public.users) + an active
    // subscription so the paywall lets every chat turn through.
    authId = randomUUID();
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`chat-${authId.slice(0, 8)}@example.com`})`,
    );
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.externalId, authId))
      .limit(1);
    if (!u) throw new Error('auth trigger did not provision user');
    userId = u.id;
    await db.insert(subscriptions).values({
      creatorId,
      userId,
      plan: 'mvp-monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    token = signJwtForTesting({ sub: authId }, JWT_SECRET);

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
    const db = getDb(DB_URL);
    if (userId) await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    if (creatorId) {
      await db.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
      await db.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
      await db.delete(messages).where(eq(messages.creatorId, creatorId));
      await db.delete(conversations).where(eq(conversations.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    if (authId) {
      await db.delete(users).where(eq(users.externalId, authId));
      await db.execute(sql`DELETE FROM auth.users WHERE id = ${authId}::uuid`);
    }
    await closeDb();
  }, 15000);

  it('happy path: returns the LLM answer with fontes and persists both turns', async () => {
    llm = new FakeLLM();
    // Force default model so this test is about persistence, not routing.
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    const firstBody = (await first.json()) as { conversationId: string };

    const second = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'O que ele pensa sobre eleições?' }),
    });
    const body = (await res.json()) as { guardrailFlag: string | null };
    expect(body.guardrailFlag).toBeNull();
    const lastUser = llm.calls[0]?.messages.at(-1)?.content ?? '';
    expect(lastUser).not.toContain('MODO EDUCACIONAL');
  });

  it('post-filter: pass when the LLM reply has no direct recommendation', async () => {
    llm = new FakeLLM({ reply: () => 'Antes de decidir, considere seu horizonte. [1]' });
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    const body = (await res.json()) as {
      postFilter: { action: string; signals: string[] };
    };
    expect(body.postFilter.action).toBe('pass');
    expect(body.postFilter.signals).toEqual([]);
    expect(llm.calls).toHaveLength(1);
  });

  it('post-filter: regenerates once with REINFORCED preamble and returns the clean retry', async () => {
    let n = 0;
    llm = new FakeLLM({
      reply: () => {
        n++;
        return n === 1
          ? 'Compre Bitcoin agora — é a hora!'
          : 'Antes de decidir, pondere seu horizonte e perfil. Conteúdo educativo; não é recomendação de investimento.';
      },
    });
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      messageId: string;
      guardrailFlag: string | null;
      postFilter: { action: string; signals: string[] };
      usage: { inputTokens: number; outputTokens: number };
    };
    expect(body.postFilter.action).toBe('regenerated');
    expect(body.postFilter.signals).toContain('imperative_asset');
    expect(body.content).not.toMatch(/\bCompre\b/i);
    expect(body.content).toContain('Conteúdo educativo');
    // Defense in depth: post-filter raises guardrailFlag even though the
    // user query "eleições brasileiras" wouldn't trigger the pre-classifier.
    expect(body.guardrailFlag).toBe('investment');

    // Two LLM calls; the second one carries the REINFORCED preamble.
    expect(llm.calls).toHaveLength(2);
    const retryUser = llm.calls[1]?.messages.at(-1)?.content ?? '';
    expect(retryUser).toContain('SUA RESPOSTA ANTERIOR foi REJEITADA');

    // Usage + cost are summed across both attempts.
    expect(body.usage.inputTokens).toBeGreaterThan(0);
    expect(body.usage.outputTokens).toBeGreaterThan(0);

    const db = getDb(DB_URL);
    const [row] = await db
      .select({ guardrailFlag: messages.guardrailFlag, content: messages.content })
      .from(messages)
      .where(eq(messages.id, body.messageId));
    expect(row?.guardrailFlag).toBe('investment');
    expect(row?.content).toBe(body.content);
  });

  it('post-filter: replaces with canned educational reply when BOTH attempts violate', async () => {
    llm = new FakeLLM({
      reply: () => 'Compre Bitcoin agora. Aloque 30% em FII.',
    });
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      guardrailFlag: string | null;
      postFilter: { action: string; signals: string[] };
    };
    expect(body.postFilter.action).toBe('replaced');
    expect(body.postFilter.signals).toEqual(
      expect.arrayContaining(['imperative_asset', 'imperative_percent']),
    );
    expect(body.guardrailFlag).toBe('investment');
    // Canned reply: no direct recommendation, ends with the CVM disclaimer.
    expect(body.content).not.toMatch(/\b(Compre|Venda|Invista|Aloque)\b/);
    expect(body.content).toContain('Conteúdo educativo; não é recomendação de investimento.');
    expect(llm.calls).toHaveLength(2);
  });

  it('anti-hallucination: regenerates with CITATION preamble when first reply has no [N]', async () => {
    let n = 0;
    llm = new FakeLLM({
      reply: () => {
        n++;
        return n === 1
          ? `${'Sobre as eleições, o cenário é complexo. '.repeat(8)}Mas isso é tudo o que sei.` // long, no [N]
          : 'Conforme o trecho [1], o panorama eleitoral é dividido entre dois polos políticos.';
      },
    });
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      guardrailFlag: string | null;
      postFilter: { action: string; category: string | null; signals: string[] };
    };
    expect(body.postFilter.action).toBe('regenerated');
    expect(body.postFilter.category).toBe('missing_citation');
    expect(body.postFilter.signals).toContain('no_citation_marker');
    expect(body.content).toContain('[1]');
    // Missing-citation never escalates to the investment flag.
    expect(body.guardrailFlag).toBeNull();

    expect(llm.calls).toHaveLength(2);
    const retryUser = llm.calls[1]?.messages.at(-1)?.content ?? '';
    expect(retryUser).toContain('filtro anti-alucinação');
  });

  it('anti-hallucination: replaces with no_context canned when BOTH attempts have no [N]', async () => {
    llm = new FakeLLM({
      // Long-ish substantive reply with no citation marker, twice in a row.
      reply: () => `${'O cenário é amplo e cheio de nuances. '.repeat(10)}Esse é o panorama.`,
    });
    const app = buildApp({ LLM_ROUTING_FORCE: 'default' });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'eleições brasileiras' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      guardrailFlag: string | null;
      fontes: unknown[];
      postFilter: { action: string; category: string | null };
    };
    expect(body.postFilter.action).toBe('replaced');
    expect(body.postFilter.category).toBe('missing_citation');
    expect(body.content).toContain('Não tenho isso registrado');
    // Canned refusal must not stand behind any source.
    expect(body.fontes).toEqual([]);
    expect(body.guardrailFlag).toBeNull();
    expect(llm.calls).toHaveLength(2);
  });

  it('routes to the fallback model for multi-question queries (and logs it)', async () => {
    llm = new FakeLLM();
    const app = buildApp();
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
    // One call: the social/factual classifier (no_context safety net). It judged
    // the message non-social, so the canned refusal is still served (no answer gen).
    expect(llm.calls).toHaveLength(1);

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

  it('extrapolates from KG principles when no chunk clears the threshold (F1.5.3)', async () => {
    const db = getDb(DB_URL);
    const ents = await db
      .insert(kgEntities)
      .values([
        { creatorId, name: 'criptomoedas', kind: 'tema' },
        { creatorId, name: 'cautela com hype', kind: 'principio' },
        { creatorId, name: 'Fausto', kind: 'pessoa' },
      ])
      .returning({ id: kgEntities.id, name: kgEntities.name });
    const id = (n: string) => ents.find((e) => e.name === n)?.id ?? '';
    await db.insert(kgRelations).values([
      { creatorId, srcId: id('criptomoedas'), dstId: id('cautela com hype'), relation: 'exige' },
      { creatorId, srcId: id('criptomoedas'), dstId: id('Fausto'), relation: 'analisada_por' },
    ]);

    llm = new FakeLLM({ reply: () => 'Pelo meu jeito de pensar, criptomoedas pedem cautela.' });
    const app = buildApp({ RERANK_SCORE_THRESHOLD: 1.01 });
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'o que você acha de criptomoedas?' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      fallback: 'no_context' | null;
      extrapolated: boolean;
      fontes: unknown[];
    };
    expect(body.fallback).toBeNull();
    expect(body.extrapolated).toBe(true);
    expect(body.fontes).toEqual([]);
    expect(body.content).toContain('cautela');
    expect(llm.calls.length).toBeGreaterThan(0);
    expect(llm.calls[0]?.messages.at(-1)?.content).toContain('MODO INFERÊNCIA');

    await db.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
    await db.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
  });

  it('leniency gates extrapolation: strict refuses, open infers with 1 fact (F1.5.4)', async () => {
    const db = getDb(DB_URL);
    const ents = await db
      .insert(kgEntities)
      .values([
        { creatorId, name: 'criptomoedas', kind: 'tema' },
        { creatorId, name: 'cautela com hype', kind: 'principio' },
      ])
      .returning({ id: kgEntities.id, name: kgEntities.name });
    const id = (n: string) => ents.find((e) => e.name === n)?.id ?? '';
    // Single relation → only `open` (min 1) extrapolates; `balanced` needs 2.
    await db
      .insert(kgRelations)
      .values([
        { creatorId, srcId: id('criptomoedas'), dstId: id('cautela com hype'), relation: 'exige' },
      ]);

    const ask = async () => {
      const res = await buildApp({ RERANK_SCORE_THRESHOLD: 1.01 }).request('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorSlug: slug, query: 'o que você acha de criptomoedas?' }),
      });
      return (await res.json()) as { fallback: string | null; extrapolated: boolean };
    };

    // strict → never extrapolate, refuse.
    await db.update(creators).set({ leniency: 'strict' }).where(eq(creators.id, creatorId));
    llm = new FakeLLM({ reply: () => 'inferência' });
    const strict = await ask();
    expect(strict.fallback).toBe('no_context');
    expect(strict.extrapolated).toBe(false);
    expect(llm.calls).toHaveLength(0);

    // open → 1 fact is enough.
    await db.update(creators).set({ leniency: 'open' }).where(eq(creators.id, creatorId));
    llm = new FakeLLM({ reply: () => 'Pelo meu jeito de pensar, exige cautela.' });
    const open = await ask();
    expect(open.fallback).toBeNull();
    expect(open.extrapolated).toBe(true);

    await db.update(creators).set({ leniency: 'balanced' }).where(eq(creators.id, creatorId));
    await db.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
    await db.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
  });

  it('returns 400 / 404 for invalid payloads and unknown creators', async () => {
    llm = new FakeLLM();
    const app = buildApp();
    expect(
      (
        await app.request('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ creatorSlug: slug, query: '' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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

  it('returns 401 without a JWT (auth required — E6.3)', async () => {
    llm = new FakeLLM();
    const res = await buildApp().request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug: slug, query: 'oi' }),
    });
    expect(res.status).toBe(401);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns 402 for an authenticated user without an active subscription', async () => {
    llm = new FakeLLM();
    const db = getDb(DB_URL);
    const otherAuthId = randomUUID();
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${otherAuthId}::uuid, ${`nosub-${otherAuthId.slice(0, 8)}@example.com`})`,
    );
    const otherToken = signJwtForTesting({ sub: otherAuthId }, JWT_SECRET);

    const res = await buildApp().request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ creatorSlug: slug, query: 'oi' }),
    });
    expect(res.status).toBe(402);
    expect(((await res.json()) as { reason: string }).reason).toBe('no_subscription');
    expect(llm.calls).toHaveLength(0);

    await db.delete(users).where(eq(users.externalId, otherAuthId));
    await db.execute(sql`DELETE FROM auth.users WHERE id = ${otherAuthId}::uuid`);
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

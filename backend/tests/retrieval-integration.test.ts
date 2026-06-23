import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { hybridSearch, retrieveAndRerank } from '../src/rag/retrieval.js';
import { FakeReranker } from '../src/rerank/fake.js';
import { ensureCreatorBySlug, upsertDocument } from '../src/services/documents.js';

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
  console.warn('[retrieval] skipped — DATABASE_URL not reachable (run `make up`).');
}

const TEXTS = [
  'A geopolítica do petróleo no Oriente Médio molda os preços do barril.',
  'Receita de bolo de chocolate fofinho com cobertura de brigadeiro.',
  'Eleições presidenciais brasileiras: análise dos candidatos e cenários.',
  'Time de futebol do nordeste vence campeonato estadual após anos.',
];

describe.skipIf(!dbReachable)('hybridSearch (integration)', () => {
  const slug = `test-retrieval-${randomUUID().slice(0, 8)}`;
  const embedder = new FakeEmbedder({ dimensions: 1536 });
  let creatorId = '';
  let documentId = '';
  let chunkIds: string[] = [];
  let embeddings: number[][] = [];

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Retrieval');
    creatorId = creator.id;
    const doc = await upsertDocument(db, {
      creatorId,
      rawText: TEXTS.join(' '),
      kind: 'article',
      title: 'Retrieval fixture',
    });
    documentId = doc.document.id;

    embeddings = await embedder.embed(TEXTS);
    const rows = await db
      .insert(chunks)
      .values(
        TEXTS.map((text, i) => ({
          creatorId,
          documentId,
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
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('returns the chunk that matches both signals at the top (highest RRF)', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[2];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const hits = await hybridSearch(db, {
      creatorId,
      query: 'eleições brasileiras candidatos',
      queryEmbedding,
    });
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top?.chunkId).toBe(chunkIds[2]);
    expect(top?.vectorRank).toBe(1);
    expect(top?.textRank).toBe(1);
    expect(top?.rrfScore).toBeGreaterThan(0);
  });

  it('keeps a vector-only hit (no textual match) in the fused result', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[1];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    // `xyzqwerty` has no tsvector hit in portuguese; only the vector leg fires.
    const hits = await hybridSearch(db, {
      creatorId,
      query: 'xyzqwerty desconhecido',
      queryEmbedding,
    });
    const bolo = hits.find((h) => h.chunkId === chunkIds[1]);
    expect(bolo).toBeDefined();
    expect(bolo?.vectorRank).toBe(1);
    expect(bolo?.textRank).toBeNull();
  });

  it('keeps a text-only hit (vector list does not surface it) in the fused result', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = await embedder.embed(['ruído aleatório xyzqwerty']);
    const hits = await hybridSearch(db, {
      creatorId,
      // strong tsvector match for chunk[0] (petróleo + oriente)
      query: 'petróleo oriente médio',
      queryEmbedding: queryEmbedding[0] ?? [],
    });
    const petro = hits.find((h) => h.chunkId === chunkIds[0]);
    expect(petro).toBeDefined();
    expect(petro?.textRank).not.toBeNull();
    // Vector rank may or may not be set depending on noise; what matters is the chunk surfaces.
  });

  it('respects topK', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const hits = await hybridSearch(db, {
      creatorId,
      query: 'petróleo eleições futebol bolo',
      queryEmbedding,
      topK: 2,
    });
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it('rejects empty queries and wrong embedding dimension', async () => {
    const db = getDb(DB_URL);
    const goodEmbedding = embeddings[0] ?? [];
    await expect(
      hybridSearch(db, { creatorId, query: '   ', queryEmbedding: goodEmbedding }),
    ).rejects.toThrow(/query is required/);

    await expect(
      hybridSearch(db, { creatorId, query: 'x', queryEmbedding: [0.1, 0.2] }),
    ).rejects.toThrow(/dims/);
  });

  it('retrieveAndRerank: returns reranked hits above the threshold', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[2];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const res = await retrieveAndRerank(db, new FakeReranker(), {
      creatorId,
      // Strong textual + semantic overlap with chunks[2].
      query: 'eleições presidenciais brasileiras candidatos',
      queryEmbedding,
      topK: 3,
      rerankScoreThreshold: 0.05,
    });
    expect(res.fallback).toBeNull();
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits.length).toBeLessThanOrEqual(3);
    // Reranker ordering must be respected (descending score, stable on ties).
    for (let i = 1; i < res.hits.length; i++) {
      expect(res.hits[i - 1]?.rerankScore ?? 0).toBeGreaterThanOrEqual(
        res.hits[i]?.rerankScore ?? -1,
      );
    }
    // Top hit should be the chunk about elections.
    expect(res.hits[0]?.chunkId).toBe(chunkIds[2]);
    // RRF and rerank scores propagate from both stages.
    expect(res.hits[0]?.rrfScore).toBeGreaterThan(0);
    expect(res.hits[0]?.rerankScore).toBeGreaterThanOrEqual(0.05);
  });

  it('retrieveAndRerank: surfaces fallback="no_context" when every score is below threshold', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const res = await retrieveAndRerank(db, new FakeReranker(), {
      creatorId,
      query: 'petróleo oriente',
      queryEmbedding,
      topK: 5,
      // Impossible threshold — FakeReranker's Jaccard ≤ 1 always.
      rerankScoreThreshold: 1.01,
    });
    expect(res.fallback).toBe('no_context');
    expect(res.hits).toEqual([]);
  });

  it('retrieveAndRerank: surfaces fallback="no_context" when hybrid returns nothing for this creator', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const res = await retrieveAndRerank(db, new FakeReranker(), {
      // creator that exists in another test but with no chunks of its own — use a random uuid.
      creatorId: '11111111-1111-4111-8111-111111111111',
      query: 'qualquer coisa',
      queryEmbedding,
    });
    expect(res.fallback).toBe('no_context');
    expect(res.hits).toEqual([]);
  });

  it('returns ranks as plain numbers (not pg numeric strings)', async () => {
    const db = getDb(DB_URL);
    const queryEmbedding = embeddings[2];
    if (!queryEmbedding) throw new Error('seed embeddings missing');
    const hits = await hybridSearch(db, {
      creatorId,
      query: 'eleições',
      queryEmbedding,
    });
    for (const h of hits) {
      if (h.vectorRank !== null) expect(typeof h.vectorRank).toBe('number');
      if (h.textRank !== null) expect(typeof h.textRank).toBe('number');
      expect(typeof h.rrfScore).toBe('number');
      expect(Number.isFinite(h.rrfScore)).toBe(true);
    }
  });
});

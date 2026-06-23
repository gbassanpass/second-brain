import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { ensureCreatorBySlug, upsertDocument } from '../src/services/documents.js';
import { ensureDocumentIndexed, indexDocument } from '../src/services/indexing.js';

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
  console.warn('[indexing-integration] skipped — DATABASE_URL not reachable (run `make up`).');
}

// 6 paragraphs × ~600 chars each ≈ 3.6k chars total → with target 400 tokens
// (~1600 chars) we expect 2–3 chunks per doc. Enough to exercise overlap + tsv.
const LONG_TEXT = Array.from({ length: 6 }, (_, i) => {
  const lead = `Parágrafo ${i + 1} sobre geopolítica, fé e empreendedorismo no Brasil contemporâneo.`;
  const body = Array.from(
    { length: 6 },
    (_, j) =>
      `Frase ${j + 1} do parágrafo ${i + 1} discutindo análise sem torcer, com fatos e interesses de cada lado da disputa observada nos últimos meses.`,
  ).join(' ');
  return `${lead} ${body}`;
}).join('\n\n');

describe.skipIf(!dbReachable)('indexDocument (integration)', () => {
  const slug = `test-index-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  let documentId = '';
  const embedder = new FakeEmbedder({ dimensions: 1536 });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Indexing');
    creatorId = creator.id;
    const doc = await upsertDocument(db, {
      creatorId,
      rawText: LONG_TEXT,
      kind: 'article',
      title: 'Long fixture',
    });
    documentId = doc.document.id;
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('inserts chunks with 1536-d embeddings and trigger-populated tsv', async () => {
    const db = getDb(DB_URL);
    const result = await indexDocument(db, embedder, {
      creatorId,
      documentId,
      rawText: LONG_TEXT,
    });
    expect(result.chunkCount).toBeGreaterThanOrEqual(2);

    const rows = await db.select().from(chunks).where(eq(chunks.documentId, documentId));
    expect(rows).toHaveLength(result.chunkCount);

    const ordinals = rows.map((r) => r.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual(ordinals.map((_, i) => i));

    for (const r of rows) {
      expect(r.creatorId).toBe(creatorId);
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.embedding).toBeTruthy();
      expect(r.embedding?.length).toBe(1536);
      // tsv populated by `chunks_tsv_trigger` (to_tsvector('portuguese', text)).
      expect(r.tsv).toBeTruthy();
      expect(typeof r.tsv).toBe('string');
      expect(r.tokenCount).toBeGreaterThan(0);
    }
  });

  it('is idempotent — re-running deletes existing chunks first', async () => {
    const db = getDb(DB_URL);
    const before = await indexDocument(db, embedder, {
      creatorId,
      documentId,
      rawText: LONG_TEXT,
    });
    const ids1 = (
      await db.select({ id: chunks.id }).from(chunks).where(eq(chunks.documentId, documentId))
    ).map((r) => r.id);

    const after = await indexDocument(db, embedder, {
      creatorId,
      documentId,
      rawText: LONG_TEXT,
    });
    const ids2 = (
      await db.select({ id: chunks.id }).from(chunks).where(eq(chunks.documentId, documentId))
    ).map((r) => r.id);

    expect(after.chunkCount).toBe(before.chunkCount);
    // Same count but all new ids (delete+insert).
    expect(new Set(ids1).size).toBe(ids1.length);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it('ensureDocumentIndexed skips work when chunks already exist', async () => {
    const db = getDb(DB_URL);
    const res = await ensureDocumentIndexed(db, embedder, {
      creatorId,
      documentId,
      rawText: LONG_TEXT,
    });
    expect(res.skipped).toBe(true);
  });

  it('uses the HNSW index for ORDER BY embedding <=> $query LIMIT N', async () => {
    const db = getDb(DB_URL);

    // Seed extra documents so the table has enough rows for the planner to
    // consider the HNSW index naturally (and so the test isn't trivial).
    for (let i = 0; i < 8; i++) {
      const doc = await upsertDocument(db, {
        creatorId,
        rawText: `Documento auxiliar ${i} ${LONG_TEXT.slice(0, 800)}`,
      });
      await indexDocument(db, embedder, {
        creatorId,
        documentId: doc.document.id,
        rawText: doc.document.rawText,
      });
    }

    const queryVec = (await embedder.embed(['fé razão geopolítica']))[0];
    expect(queryVec).toBeDefined();
    const vectorLiteral = `[${queryVec?.join(',')}]`;

    // `SET LOCAL` only applies inside its transaction, so run the GUC + EXPLAIN
    // on the same connection. Without this, pgvector falls back to seq scan
    // because the table is small.
    const planJson = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = OFF`);
      const plan = await tx.execute(
        sql.raw(`
          EXPLAIN (FORMAT JSON, ANALYZE)
          SELECT id
          FROM chunks
          ORDER BY embedding <=> '${vectorLiteral}'::vector
          LIMIT 5
        `),
      );
      return JSON.stringify(plan);
    });

    expect(planJson).toContain('chunks_embedding_hnsw_idx');
    expect(planJson).toMatch(/Index Scan/);
  });
});

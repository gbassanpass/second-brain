import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import type { LLMClient, LLMResult } from '../src/llm/base.js';
import { hybridSearch } from '../src/rag/retrieval.js';
import { ensureCreatorBySlug, upsertDocument } from '../src/services/documents.js';
import { enrichCreatorChunks } from '../src/services/enrich-chunks.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

async function probeDb(url: string): Promise<boolean> {
  const client = postgres(url, { connect_timeout: 1, max: 1, idle_timeout: 1 });
  try {
    await client`select 1`;
    return true;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}
const dbReachable = await probeDb(DB_URL).catch(() => false);

const RAW = 'A dívida pública dos Estados Unidos pressiona a estratégia monetária global.';
const QUESTION = 'Por que a dívida americana afeta a economia mundial?';

/** Always returns a fixed enrichment JSON, ignoring the prompt. */
function fakeEnrichLLM(): LLMClient {
  return {
    provider: 'fake',
    async complete(): Promise<LLMResult> {
      return {
        content: JSON.stringify({
          summary: 'A dívida dos EUA molda a política monetária mundial.',
          questions: [QUESTION, 'O que é estratégia monetária global?'],
        }),
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  };
}

describe.skipIf(!dbReachable)('chunk enrichment (F1.8)', () => {
  const slug = `test-enrich-${randomUUID().slice(0, 8)}`;
  const embedder = new FakeEmbedder({ dimensions: 1536 });
  let creatorId = '';
  let rawId = '';

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Enrich');
    creatorId = creator.id;
    const doc = await upsertDocument(db, { creatorId, rawText: RAW, kind: 'article', title: 'x' });
    const [emb] = await embedder.embed([RAW]);
    const [row] = await db
      .insert(chunks)
      .values({ creatorId, documentId: doc.document.id, ordinal: 0, text: RAW, embedding: emb })
      .returning({ id: chunks.id });
    rawId = row?.id ?? '';
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
    await closeDb();
  });

  it('inserts summary + question rows linked to the raw chunk', async () => {
    const res = await enrichCreatorChunks(getDb(DB_URL), embedder, fakeEnrichLLM(), {
      creatorId,
      model: 'm',
    });
    expect(res.enriched).toBe(1);
    expect(res.rowsAdded).toBe(3); // 1 summary + 2 questions

    const children = await getDb(DB_URL)
      .select({ kind: chunks.enrichedKind, parent: chunks.parentChunkId })
      .from(chunks)
      .where(and(eq(chunks.creatorId, creatorId), eq(chunks.parentChunkId, rawId)));
    expect(children).toHaveLength(3);
    expect(children.filter((c) => c.kind === 'summary')).toHaveLength(1);
    expect(children.filter((c) => c.kind === 'question')).toHaveLength(2);
  });

  it('is idempotent — re-running enriches nothing new', async () => {
    const res = await enrichCreatorChunks(getDb(DB_URL), embedder, fakeEnrichLLM(), {
      creatorId,
      model: 'm',
    });
    expect(res.enriched).toBe(0);
    expect(res.rowsAdded).toBe(0);
  });

  it('a query matching the hypothetical question surfaces the RAW chunk (deduped)', async () => {
    const [queryEmbedding] = await embedder.embed([QUESTION]);
    const hits = await hybridSearch(getDb(DB_URL), {
      creatorId,
      query: QUESTION,
      queryEmbedding: queryEmbedding ?? [],
      candidatePoolSize: 50,
      topK: 10,
    });
    // The logical chunk appears once, and its surfaced text is the RAW text.
    const forRaw = hits.filter((h) => h.chunkId === rawId);
    expect(forRaw).toHaveLength(1);
    expect(forRaw[0]?.text).toBe(RAW);
    // No enrichment row leaks as its own hit.
    expect(hits.every((h) => h.text !== QUESTION)).toBe(true);
  });
});

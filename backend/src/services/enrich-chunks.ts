import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient } from '../llm/base.js';
import { enrichChunk } from '../rag/enrich.js';

export interface EnrichChunksResult {
  /** Raw chunks that got enrichment rows this run. */
  enriched: number;
  /** Total summary+question rows inserted. */
  rowsAdded: number;
  /** Raw chunks skipped because the LLM returned nothing usable. */
  skipped: number;
}

/**
 * Enrich a creator's raw chunks (F1.8): for each raw chunk without enrichment
 * rows yet, generate a summary + hypothetical questions and insert them as their
 * own embedded chunk rows (linked via parent_chunk_id). Idempotent — re-running
 * only touches raw chunks that don't have children, so a re-import enriches just
 * the new content. Best-effort per chunk; a failure on one chunk skips it.
 *
 * Runs in the background kg-build job (has the LLM + embedder), so it never
 * blocks the import or the chat.
 */
export async function enrichCreatorChunks(
  db: Database,
  embedder: Embedder,
  llm: LLMClient,
  input: { creatorId: string; model: string; maxChunks?: number },
): Promise<EnrichChunksResult> {
  const maxChunks = input.maxChunks ?? 500;

  // Raw chunks that have no enrichment children yet.
  const pending = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      ordinal: chunks.ordinal,
      text: chunks.text,
    })
    .from(chunks)
    .where(
      and(
        eq(chunks.creatorId, input.creatorId),
        eq(chunks.enrichedKind, 'raw'),
        sql`NOT EXISTS (SELECT 1 FROM ${chunks} child WHERE child.parent_chunk_id = ${chunks.id})`,
      ),
    )
    .limit(maxChunks);

  let enriched = 0;
  let rowsAdded = 0;
  let skipped = 0;

  for (const raw of pending) {
    const enrichment = await enrichChunk(llm, { text: raw.text, model: input.model });
    if (!enrichment) {
      skipped += 1;
      continue;
    }

    // Embed the summary + each question; insert one chunk row per derived text.
    const derived = [
      { kind: 'summary' as const, text: enrichment.summary },
      ...enrichment.questions.map((q) => ({ kind: 'question' as const, text: q })),
    ];
    let vectors: number[][];
    try {
      vectors = await embedder.embed(derived.map((d) => d.text));
    } catch {
      skipped += 1;
      continue;
    }
    if (vectors.length !== derived.length) {
      skipped += 1;
      continue;
    }

    await db.insert(chunks).values(
      derived.map((d, i) => ({
        creatorId: input.creatorId,
        documentId: raw.documentId,
        ordinal: raw.ordinal,
        text: d.text,
        embedding: vectors[i] ?? null,
        enrichedKind: d.kind,
        parentChunkId: raw.id,
      })),
    );
    enriched += 1;
    rowsAdded += derived.length;
  }

  return { enriched, rowsAdded, skipped };
}

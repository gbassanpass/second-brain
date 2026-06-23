import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { EMBEDDING_DIMENSIONS } from '../db/types.js';

export interface HybridSearchOptions {
  creatorId: string;
  /** User query — used for `plainto_tsquery('portuguese', …)`. */
  query: string;
  /** Embedding of `query` (same model used for the chunks; dim must match). */
  queryEmbedding: number[];
  /** Candidates pulled per side before fusion. Default 50. */
  candidatePoolSize?: number;
  /** RRF constant (Cormack 2009). Default 60. */
  rrfK?: number;
  /** Final result size after RRF. Default = candidatePoolSize. */
  topK?: number;
}

export interface HybridSearchHit {
  chunkId: string;
  documentId: string;
  ordinal: number;
  text: string;
  /** 1-based rank in the vector list, or null if not in top vectorPool. */
  vectorRank: number | null;
  /** 1-based rank in the textual list, or null if not matched by tsquery. */
  textRank: number | null;
  /** RRF score = sum(1/(k + rank)) over the lists the hit appears in. */
  rrfScore: number;
}

interface HybridSearchRow {
  chunk_id: string;
  document_id: string;
  ordinal: number;
  text: string;
  vector_rank: string | number | null;
  text_rank: string | number | null;
  rrf_score: string | number;
}

/**
 * Hybrid retrieval per `docs/05-rag-and-guardrails.md`:
 *   - Vector top-N via `embedding <=> query` (cosine, HNSW-friendly).
 *   - Textual top-N via `ts_rank(tsv, plainto_tsquery('portuguese', q))`.
 *   - Fuse with Reciprocal Rank Fusion (RRF): score = Σ 1/(k + rank_i).
 *
 * Single round-trip SQL — the planner sees both legs together and the
 * FULL OUTER JOIN keeps hits that only one side surfaced (key for recall on
 * queries that are strong on one signal and weak on the other).
 */
export async function hybridSearch(
  db: Database,
  opts: HybridSearchOptions,
): Promise<HybridSearchHit[]> {
  if (opts.queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `hybridSearch: queryEmbedding has ${opts.queryEmbedding.length} dims, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  const trimmedQuery = opts.query.trim();
  if (!trimmedQuery) {
    throw new Error('hybridSearch: query is required');
  }

  const poolSize = opts.candidatePoolSize ?? 50;
  const k = opts.rrfK ?? 60;
  const topK = opts.topK ?? poolSize;
  const embeddingLiteral = `[${opts.queryEmbedding.join(',')}]`;

  const rows = (await db.execute(sql`
    WITH vector_results AS (
      SELECT id, document_id, ordinal, text,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingLiteral}::vector) AS rank
      FROM chunks
      WHERE creator_id = ${opts.creatorId}::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${poolSize}
    ),
    text_results AS (
      SELECT id, document_id, ordinal, text,
             ROW_NUMBER() OVER (
               ORDER BY ts_rank(tsv, plainto_tsquery('portuguese', ${trimmedQuery})) DESC
             ) AS rank
      FROM chunks
      WHERE creator_id = ${opts.creatorId}::uuid
        AND tsv @@ plainto_tsquery('portuguese', ${trimmedQuery})
      LIMIT ${poolSize}
    )
    SELECT
      COALESCE(v.id, t.id) AS chunk_id,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.ordinal, t.ordinal) AS ordinal,
      COALESCE(v.text, t.text) AS text,
      v.rank AS vector_rank,
      t.rank AS text_rank,
      (
        COALESCE(1.0 / (${k} + v.rank), 0)
        + COALESCE(1.0 / (${k} + t.rank), 0)
      ) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN text_results t ON v.id = t.id
    ORDER BY rrf_score DESC
    LIMIT ${topK}
  `)) as unknown as HybridSearchRow[];

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    ordinal: Number(r.ordinal),
    text: r.text,
    vectorRank: r.vector_rank === null ? null : Number(r.vector_rank),
    textRank: r.text_rank === null ? null : Number(r.text_rank),
    rrfScore: Number(r.rrf_score),
  }));
}

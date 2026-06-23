import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import type { ChunkOptions } from '../rag/chunker.js';
import { chunkText } from '../rag/chunker.js';

export interface IndexDocumentInput {
  creatorId: string;
  documentId: string;
  rawText: string;
  chunkOptions?: ChunkOptions;
}

export interface IndexDocumentResult {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
}

/**
 * Chunk + embed + insert. Idempotente: apaga os chunks atuais do documento
 * antes de inserir os novos (atende a re-ingest e edição de raw_text — embora
 * E1.2 trate edição como documento novo, isto cobre o reprocessamento manual).
 * `tsv` é populado pelo trigger `chunks_tsv_trigger` (`to_tsvector('portuguese')`).
 */
export async function indexDocument(
  db: Database,
  embedder: Embedder,
  input: IndexDocumentInput,
): Promise<IndexDocumentResult> {
  const pieces = chunkText(input.rawText, input.chunkOptions);

  await db.delete(chunks).where(eq(chunks.documentId, input.documentId));

  if (pieces.length === 0) {
    return { documentId: input.documentId, chunkCount: 0, skipped: false };
  }

  const vectors = await embedder.embed(pieces.map((p) => p.text));
  if (vectors.length !== pieces.length) {
    throw new Error(
      `indexDocument: embedder returned ${vectors.length} vectors for ${pieces.length} chunks`,
    );
  }
  if (embedder.dimensions !== 1536) {
    throw new Error(
      `indexDocument: embedder dimension ${embedder.dimensions} does not match chunks.embedding (1536)`,
    );
  }

  const rows = pieces.map((p, i) => ({
    creatorId: input.creatorId,
    documentId: input.documentId,
    ordinal: p.ordinal,
    text: p.text,
    embedding: vectors[i] ?? null,
    tokenCount: p.tokenCount,
  }));

  await db.insert(chunks).values(rows);

  return { documentId: input.documentId, chunkCount: pieces.length, skipped: false };
}

/**
 * Indexa apenas se o documento ainda não tem chunks. Útil pra re-rodar o
 * ingest sem pagar embedding de novo para documentos já processados.
 */
export async function ensureDocumentIndexed(
  db: Database,
  embedder: Embedder,
  input: IndexDocumentInput,
): Promise<IndexDocumentResult> {
  const existing = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(eq(chunks.documentId, input.documentId))
    .limit(1);
  if (existing.length > 0) {
    return { documentId: input.documentId, chunkCount: existing.length, skipped: true };
  }
  return indexDocument(db, embedder, input);
}

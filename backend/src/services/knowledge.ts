import type { Database } from '../db/client.js';
import type { Embedder } from '../embeddings/base.js';
import { upsertDocument } from './documents.js';
import { indexDocument } from './indexing.js';

/**
 * Manually add a piece of knowledge to a creator's base (F1.9) and index it
 * immediately so the RAG can use it right away. Mirrors the Delphi "Add
 * Knowledge" modal — for the MVP we support free text and Q&A (the two that
 * work end-to-end without extra fetching/parsing). The training correction
 * (F1.12) is just `type: 'qa'` under the hood.
 */
export type KnowledgeInput =
  | { type: 'note'; creatorId: string; text: string; title?: string }
  | { type: 'qa'; creatorId: string; creatorName: string; question: string; answer: string };

export interface AddKnowledgeResult {
  documentId: string;
  chunkCount: number;
  kind: 'article' | 'qa';
}

export async function addKnowledge(
  db: Database,
  embedder: Embedder,
  input: KnowledgeInput,
): Promise<AddKnowledgeResult> {
  let rawText: string;
  let kind: 'article' | 'qa';
  let title: string;

  if (input.type === 'qa') {
    const q = input.question.trim();
    const a = input.answer.trim();
    rawText = `Pergunta: ${q}\n\nResposta de ${input.creatorName}: ${a}`;
    kind = 'qa';
    title = q.slice(0, 80);
  } else {
    rawText = input.text.trim();
    kind = 'article';
    title = (input.title?.trim() || rawText).slice(0, 80);
  }

  const up = await upsertDocument(db, { creatorId: input.creatorId, rawText, kind, title });
  const idx = await indexDocument(db, embedder, {
    creatorId: input.creatorId,
    documentId: up.document.id,
    rawText,
  });
  return { documentId: up.document.id, chunkCount: idx.chunkCount, kind };
}

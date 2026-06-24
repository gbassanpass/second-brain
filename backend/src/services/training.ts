import type { Database } from '../db/client.js';
import type { Embedder } from '../embeddings/base.js';
import { upsertDocument } from './documents.js';
import { indexDocument } from './indexing.js';

/**
 * The real "training" mechanic (F1.12). We don't fine-tune a model — the clone
 * is RAG + persona. So a creator's correction is persisted as a high-signal Q&A
 * `document` and indexed immediately. Next time someone asks a similar question,
 * retrieval matches this Q&A (question↔question similarity is high) and the
 * clone answers with the creator's own corrected wording.
 *
 * Storing BOTH the question and the corrected answer in the text makes the
 * embedding match the question well while giving the LLM the answer to echo.
 */
export interface SaveCorrectionInput {
  creatorId: string;
  creatorName: string;
  question: string;
  answer: string;
}

export interface SaveCorrectionResult {
  documentId: string;
  chunkCount: number;
}

export async function saveTrainingCorrection(
  db: Database,
  embedder: Embedder,
  input: SaveCorrectionInput,
): Promise<SaveCorrectionResult> {
  const question = input.question.trim();
  const answer = input.answer.trim();
  const rawText = `Pergunta: ${question}\n\nResposta de ${input.creatorName}: ${answer}`;

  const up = await upsertDocument(db, {
    creatorId: input.creatorId,
    rawText,
    kind: 'qa',
    title: question.slice(0, 80),
  });
  const idx = await indexDocument(db, embedder, {
    creatorId: input.creatorId,
    documentId: up.document.id,
    rawText,
  });
  return { documentId: up.document.id, chunkCount: idx.chunkCount };
}

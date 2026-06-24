import type { Database } from '../db/client.js';
import type { Embedder } from '../embeddings/base.js';
import { addKnowledge } from './knowledge.js';

/**
 * The real "training" mechanic (F1.12). We don't fine-tune a model — the clone
 * is RAG + persona. So a creator's correction is persisted as a high-signal Q&A
 * `document` and indexed immediately. Next time someone asks a similar question,
 * retrieval matches this Q&A (question↔question similarity is high) and the
 * clone answers with the creator's own corrected wording.
 *
 * A correction is just a manually-added Q&A piece of knowledge (F1.9), so this
 * delegates to `addKnowledge` to share the upsert + immediate index path.
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
  const { documentId, chunkCount } = await addKnowledge(db, embedder, {
    type: 'qa',
    creatorId: input.creatorId,
    creatorName: input.creatorName,
    question: input.question,
    answer: input.answer,
  });
  return { documentId, chunkCount };
}

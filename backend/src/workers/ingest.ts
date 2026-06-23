import { Worker } from 'bullmq';
import type { Database } from '../db/client.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient } from '../llm/base.js';
import { trainPersonaIfMissing } from '../services/persona-gen.js';
import { type SyncSourceResult, syncContentSource } from '../services/source-ingest.js';
import { INGEST_QUEUE_NAME, type IngestSourceJobData, parseRedisUrl } from './queue.js';

export interface IngestWorkerOptions {
  redisUrl: string;
  db: Database;
  embedder: Embedder;
  /** When set, auto-generates the Persona Card after a fresh import (F1.x). */
  llm?: LLMClient;
  personaModel?: string;
  concurrency?: number;
  onCompleted?: (sourceId: string, result: SyncSourceResult) => void;
  onFailed?: (sourceId: string, err: Error) => void;
}

export interface IngestWorkerHandle {
  worker: Worker<IngestSourceJobData, SyncSourceResult>;
  close: () => Promise<void>;
}

export function startIngestWorker(opts: IngestWorkerOptions): IngestWorkerHandle {
  const worker = new Worker<IngestSourceJobData, SyncSourceResult>(
    INGEST_QUEUE_NAME,
    async (job) => {
      const result = await syncContentSource(opts.db, opts.embedder, job.data.sourceId);
      // After a fresh import with content, train the persona (best-effort).
      if (opts.llm && result.chunks.created > 0) {
        await trainPersonaIfMissing(
          opts.db,
          opts.llm,
          job.data.sourceId,
          opts.personaModel ?? 'claude-haiku-4-5',
        );
      }
      return result;
    },
    {
      connection: parseRedisUrl(opts.redisUrl),
      concurrency: opts.concurrency ?? 1,
    },
  );

  worker.on('completed', (job, result) => {
    opts.onCompleted?.(job.data.sourceId, result);
  });
  worker.on('failed', (job, err) => {
    if (job) opts.onFailed?.(job.data.sourceId, err);
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}

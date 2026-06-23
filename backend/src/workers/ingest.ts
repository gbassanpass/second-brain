import { Worker } from 'bullmq';
import type { Database } from '../db/client.js';
import type { Embedder } from '../embeddings/base.js';
import { type SyncSourceResult, syncContentSource } from '../services/source-ingest.js';
import { INGEST_QUEUE_NAME, type IngestSourceJobData, parseRedisUrl } from './queue.js';

export interface IngestWorkerOptions {
  redisUrl: string;
  db: Database;
  embedder: Embedder;
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
    async (job) => syncContentSource(opts.db, opts.embedder, job.data.sourceId),
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

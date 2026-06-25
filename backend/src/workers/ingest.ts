import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient } from '../llm/base.js';
import { enrichCreatorChunks } from '../services/enrich-chunks.js';
import { type BuildGraphResult, buildGraphForCreator } from '../services/kg-build.js';
import { trainPersonaIfMissing } from '../services/persona-gen.js';
import { type SyncSourceResult, syncContentSource } from '../services/source-ingest.js';
import { generateSuggestedQuestions } from '../services/suggested-questions.js';
import {
  INGEST_QUEUE_NAME,
  type IngestQueueJobData,
  type IngestSourceJobData,
  KG_BUILD_JOB_NAME,
  type KgBuildJobData,
  enqueueKgBuild,
  parseRedisUrl,
} from './queue.js';

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
  /** Fired when a background knowledge-graph build completes. */
  onKgBuilt?: (creatorId: string, result: BuildGraphResult) => void;
  onKgFailed?: (creatorId: string, err: Error) => void;
  /** Enrich chunks (F1.8) in the kg-build job. Default true; set false to disable. */
  enrichChunks?: boolean;
}

type JobResult = SyncSourceResult | (BuildGraphResult & { kind: 'kg-build' });

export interface IngestWorkerHandle {
  worker: Worker<IngestQueueJobData, JobResult>;
  close: () => Promise<void>;
}

export function startIngestWorker(opts: IngestWorkerOptions): IngestWorkerHandle {
  const model = opts.personaModel ?? 'claude-haiku-4-5';
  const worker = new Worker<IngestQueueJobData, JobResult>(
    INGEST_QUEUE_NAME,
    async (job) => {
      // Background knowledge-graph build (manual "Atualizar grafo" or the
      // auto-build enqueued after an import). Maps how the creator thinks.
      if (job.name === KG_BUILD_JOB_NAME) {
        const { creatorId } = job.data as KgBuildJobData;
        if (!opts.llm) throw new Error('kg-build requires an LLM');
        const [creator] = await opts.db
          .select({ displayName: creators.displayName })
          .from(creators)
          .where(eq(creators.id, creatorId))
          .limit(1);
        const creatorName = creator?.displayName ?? 'o criador';
        const built = await buildGraphForCreator(opts.db, opts.llm, {
          creatorId,
          creatorName,
          model,
        });
        // Enrich raw chunks with summaries + hypothetical questions (F1.8) so
        // retrieval recall goes up. Best-effort; only touches new raw chunks.
        if (opts.enrichChunks !== false) {
          await enrichCreatorChunks(opts.db, opts.embedder, opts.llm, { creatorId, model }).catch(
            () => undefined,
          );
        }
        // Refresh the chat's starter questions from the new graph (F1.20).
        await generateSuggestedQuestions(opts.db, opts.llm, {
          creatorId,
          creatorName,
          model,
        }).catch(() => undefined);
        return { kind: 'kg-build', ...built };
      }

      const { sourceId } = job.data as IngestSourceJobData;
      const result = await syncContentSource(opts.db, opts.embedder, sourceId);
      // After a fresh import with content, train the persona (best-effort) and
      // map the knowledge graph in the background — so the Mind 3D view fills in
      // automatically, no "Extrair grafo" click required.
      if (opts.llm && result.chunks.created > 0) {
        await trainPersonaIfMissing(opts.db, opts.llm, sourceId, model);
        await enqueueKgBuild(result.creatorId, opts.redisUrl).catch(() => undefined);
      }
      return result;
    },
    {
      connection: parseRedisUrl(opts.redisUrl),
      concurrency: opts.concurrency ?? 1,
    },
  );

  worker.on('completed', (job, result) => {
    if (job.name === KG_BUILD_JOB_NAME) {
      opts.onKgBuilt?.((job.data as KgBuildJobData).creatorId, result as BuildGraphResult);
    } else {
      opts.onCompleted?.((job.data as IngestSourceJobData).sourceId, result as SyncSourceResult);
    }
  });
  worker.on('failed', (job, err) => {
    if (!job) return;
    if (job.name === KG_BUILD_JOB_NAME) {
      opts.onKgFailed?.((job.data as KgBuildJobData).creatorId, err);
    } else {
      opts.onFailed?.((job.data as IngestSourceJobData).sourceId, err);
    }
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}

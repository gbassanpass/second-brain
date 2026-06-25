import { Queue } from 'bullmq';

export const INGEST_QUEUE_NAME = 'ingest-source';

export interface IngestSourceJobData {
  sourceId: string;
}

export interface KgBuildJobData {
  creatorId: string;
}

/** Both job kinds share the ingest queue; the BullMQ job `name` discriminates. */
export type IngestQueueJobData = IngestSourceJobData | KgBuildJobData;

export const KG_BUILD_JOB_NAME = 'kg-build';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
}

export function parseRedisUrl(url: string): RedisConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    // BullMQ requirement: blocking commands must not retry per-request.
    maxRetriesPerRequest: null,
  };
}

let cachedQueue: Queue<IngestQueueJobData> | undefined;

/**
 * Lazy singleton — opens a BullMQ queue (and underlying Redis connection) on
 * first call. `Queue.close()` from `closeIngestQueue` closes the connection.
 */
export function getIngestQueue(redisUrl?: string): Queue<IngestQueueJobData> {
  if (cachedQueue) return cachedQueue;
  const url = redisUrl ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required for the ingest queue');
  }
  const queue = new Queue<IngestQueueJobData>(INGEST_QUEUE_NAME, {
    connection: parseRedisUrl(url),
  });
  cachedQueue = queue;
  return queue;
}

export async function closeIngestQueue(): Promise<void> {
  if (cachedQueue) await cachedQueue.close();
  cachedQueue = undefined;
}

export async function enqueueIngestSync(
  sourceId: string,
  redisUrl?: string,
): Promise<{ jobId: string }> {
  const queue = getIngestQueue(redisUrl);
  const job = await queue.add(
    'sync',
    { sourceId },
    {
      // Same jobId while the job is queued/active blocks duplicate enqueues —
      // good for "user clicked sync twice". Released once the job is removed.
      jobId: `sync-${sourceId}`,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
  return { jobId: String(job.id ?? `sync-${sourceId}`) };
}

/**
 * Enqueue a knowledge-graph build for a creator. Runs in the background on the
 * ingest worker (LLM extraction can take a while). `removeOnComplete: true`
 * frees the deduped jobId immediately so a later "Atualizar grafo" can re-run;
 * while a build is queued/active, the shared jobId blocks duplicate builds.
 */
export async function enqueueKgBuild(
  creatorId: string,
  redisUrl?: string,
): Promise<{ jobId: string }> {
  const queue = getIngestQueue(redisUrl);
  const job = await queue.add(
    KG_BUILD_JOB_NAME,
    { creatorId },
    { jobId: `kg-${creatorId}`, removeOnComplete: true, removeOnFail: true },
  );
  return { jobId: String(job.id ?? `kg-${creatorId}`) };
}

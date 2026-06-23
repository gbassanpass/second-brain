import { Queue } from 'bullmq';

export const INGEST_QUEUE_NAME = 'ingest-source';

export interface IngestSourceJobData {
  sourceId: string;
}

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

let cachedQueue: Queue<IngestSourceJobData> | undefined;

/**
 * Lazy singleton — opens a BullMQ queue (and underlying Redis connection) on
 * first call. `Queue.close()` from `closeIngestQueue` closes the connection.
 */
export function getIngestQueue(redisUrl?: string): Queue<IngestSourceJobData> {
  if (cachedQueue) return cachedQueue;
  const url = redisUrl ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required for the ingest queue');
  }
  const queue = new Queue<IngestSourceJobData>(INGEST_QUEUE_NAME, {
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

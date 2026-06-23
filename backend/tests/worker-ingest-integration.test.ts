import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, contentSources, creators, documents } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { ensureManualSource } from '../src/services/source-ingest.js';
import { startIngestWorker } from '../src/workers/ingest.js';
import { closeIngestQueue, enqueueIngestSync, getIngestQueue } from '../src/workers/queue.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';

async function probeDb(url: string): Promise<boolean> {
  const client = postgres(url, { connect_timeout: 1, max: 1, idle_timeout: 1 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function probeRedis(url: string): Promise<boolean> {
  // Probe via TCP — avoid pulling ioredis types here.
  try {
    const u = new URL(url);
    const net = await import('node:net');
    return await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) }, () => {
        sock.end();
        resolve(true);
      });
      sock.setTimeout(500, () => {
        sock.destroy();
        resolve(false);
      });
      sock.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

const dbReachable = await probeDb(DB_URL);
const redisReachable = await probeRedis(REDIS_URL);
const ready = dbReachable && redisReachable;

if (!ready) {
  console.warn(
    `[worker-ingest] skipped — db=${dbReachable} redis=${redisReachable} (run \`make up\`).`,
  );
}

describe.skipIf(!ready)('ingest worker end-to-end (Redis + DB)', () => {
  const slug = `test-worker-${randomUUID().slice(0, 8)}`;
  const embedder = new FakeEmbedder({ dimensions: 1536 });
  let creatorId = '';
  let sourceId = '';
  let dataDir = '';
  let workerHandle: Awaited<ReturnType<typeof startIngestWorker>> | undefined;

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Worker');
    creatorId = creator.id;
    const source = await ensureManualSource(db, creatorId);
    sourceId = source.id;
    // Use externalRef to point the connector at our tmp fixture dir (the
    // service falls back to it before deriving from creator slug).
    dataDir = await mkdtemp(join(tmpdir(), 'worker-ingest-'));
    await mkdir(join(dataDir, 'posts'), { recursive: true });
    await writeFile(join(dataDir, 'posts', 'x.md'), 'doc do worker', 'utf8');
    await writeFile(join(dataDir, 'posts', 'y.md'), 'outro doc do worker', 'utf8');
    await db
      .update(contentSources)
      .set({ externalRef: dataDir })
      .where(eq(contentSources.id, sourceId));

    // Clean any previous job state for this queue to avoid cross-run pollution.
    const queue = getIngestQueue(REDIS_URL);
    await queue.obliterate({ force: true }).catch(() => undefined);

    workerHandle = startIngestWorker({
      redisUrl: REDIS_URL,
      db,
      embedder,
      concurrency: 1,
    });
  }, 30000);

  afterAll(async () => {
    if (workerHandle) await workerHandle.close();
    await closeIngestQueue();
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    await closeDb();
  }, 30000);

  it('processes the enqueued job: status pending → indexing → indexed', async () => {
    const { worker } = workerHandle ?? {};
    if (!worker) throw new Error('worker not started');

    const completed = new Promise<{ sourceId: string; result: unknown }>(
      (resolveCompleted, rejectCompleted) => {
        worker.once('completed', (job, result) =>
          resolveCompleted({ sourceId: job.data.sourceId, result }),
        );
        worker.once('failed', (_job, err) => rejectCompleted(err));
      },
    );

    const { jobId } = await enqueueIngestSync(sourceId, REDIS_URL);
    expect(jobId).toBe(`sync-${sourceId}`);

    const { sourceId: completedFor } = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('worker timeout')), 10000),
      ),
    ]);
    expect(completedFor).toBe(sourceId);

    const db = getDb(DB_URL);
    const [src] = await db
      .select({ status: contentSources.status, lastSyncedAt: contentSources.lastSyncedAt })
      .from(contentSources)
      .where(eq(contentSources.id, sourceId));
    expect(src?.status).toBe('indexed');
    expect(src?.lastSyncedAt).toBeInstanceOf(Date);

    const docRows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.creatorId, creatorId));
    expect(docRows).toHaveLength(2);

    const chunkRows = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.creatorId, creatorId));
    expect(chunkRows.length).toBeGreaterThanOrEqual(2);
  }, 30000);
});

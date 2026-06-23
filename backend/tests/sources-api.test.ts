import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/client.js';
import { contentSources, creators } from '../src/db/schema.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { ensureManualSource } from '../src/services/source-ingest.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

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

const dbReachable = await probeDb(DB_URL);
if (!dbReachable) {
  console.warn('[sources-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/sources/:id/sync', () => {
  const slug = `test-sources-api-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  let sourceId = '';
  const enqueueSync = vi.fn(async (id: string) => ({ jobId: `fake-${id}` }));
  const app = createApp({ getDb: () => getDb(DB_URL), enqueueSync });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Sources API');
    creatorId = creator.id;
    const source = await ensureManualSource(db, creatorId);
    sourceId = source.id;
    // Pretend a previous sync indexed it, to verify the route resets to pending.
    await db
      .update(contentSources)
      .set({ status: 'indexed' })
      .where(eq(contentSources.id, sourceId));
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('returns 202 with jobId, resets status to pending, and enqueues', async () => {
    enqueueSync.mockClear();
    const res = await app.request(`/api/sources/${sourceId}/sync`, {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { sourceId: string; jobId: string; status: string };
    expect(body.sourceId).toBe(sourceId);
    expect(body.jobId).toBe(`fake-${sourceId}`);
    expect(body.status).toBe('pending');

    expect(enqueueSync).toHaveBeenCalledTimes(1);
    expect(enqueueSync).toHaveBeenCalledWith(sourceId);

    const db = getDb(DB_URL);
    const [src] = await db
      .select({ status: contentSources.status })
      .from(contentSources)
      .where(eq(contentSources.id, sourceId));
    expect(src?.status).toBe('pending');
  });

  it('returns 400 for non-UUID id', async () => {
    const res = await app.request('/api/sources/not-a-uuid/sync', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown source id', async () => {
    enqueueSync.mockClear();
    const res = await app.request('/api/sources/11111111-1111-4111-8111-111111111111/sync', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
    expect(enqueueSync).not.toHaveBeenCalled();
  });
});

import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, contentSources, creators, documents, users } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { syncContentSource } from '../src/services/source-ingest.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

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
  console.warn('[instagram-ingest-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/creators/:slug/sources/instagram — async (F1.11)', () => {
  const slug = `ig-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  // Capture enqueued jobs instead of hitting Redis. The worker path is tested
  // separately by calling syncContentSource directly below.
  const enqueued: string[] = [];
  const app = createApp({
    getDb: () => getDb(DB_URL),
    jwtSecret: JWT_SECRET,
    enqueueSync: async (sourceId: string) => {
      enqueued.push(sourceId);
      return { jobId: `job-${sourceId}` };
    },
  });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`ig-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'IG Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    if (authIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, authIds));
      for (const id of authIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    await closeDb();
  }, 15000);

  function post(token: string, body: unknown) {
    return app.request(`/api/creators/${slug}/sources/instagram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  it('401 anon, 403 subscriber, 400 invalid body', async () => {
    expect(
      (
        await app.request(`/api/creators/${slug}/sources/instagram`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401);
    expect((await post(subscriberToken, { handle: 'faustobassan' })).status).toBe(403);
    expect((await post(operatorToken, { handle: '' })).status).toBe(400);
  });

  it('enqueues the import and returns 202 with a pending source', async () => {
    const res = await post(operatorToken, { handle: '@faustobassan' });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { sourceId: string; status: string; handle: string };
    expect(body.status).toBe('pending');
    expect(body.handle).toBe('@faustobassan');
    expect(enqueued).toContain(body.sourceId);

    // The content_source exists as instagram/pending (Studio "Fontes").
    const [src] = await getDb(DB_URL)
      .select({ kind: contentSources.kind, status: contentSources.status })
      .from(contentSources)
      .where(eq(contentSources.id, body.sourceId))
      .limit(1);
    expect(src).toMatchObject({ kind: 'instagram', status: 'pending' });
  });

  it('worker path (syncContentSource) imports posts → docs + chunks, idempotent', async () => {
    // Simulates what the BullMQ worker does for the enqueued job: the default
    // connector resolves the Instagram scraper (fake in test) from config.
    const db = getDb(DB_URL);
    const [src] = await db
      .select({ id: contentSources.id })
      .from(contentSources)
      .where(eq(contentSources.creatorId, creatorId))
      .limit(1);
    if (!src) throw new Error('expected an instagram source from the previous test');

    const embedder = new FakeEmbedder({ dimensions: 1536 });
    const first = await syncContentSource(db, embedder, src.id);
    expect(first.status).toBe('indexed');
    expect(first.docs.inserted).toBeGreaterThan(0);
    expect(first.chunks.created).toBeGreaterThan(0);

    const second = await syncContentSource(db, embedder, src.id);
    expect(second.docs.inserted).toBe(0);
    expect(second.docs.duplicate).toBeGreaterThan(0);
  });
});

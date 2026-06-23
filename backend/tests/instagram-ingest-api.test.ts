import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, contentSources, creators, documents, users } from '../src/db/schema.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';

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

describe.skipIf(!dbReachable)('POST /api/creators/:slug/sources/instagram (F1.11)', () => {
  const slug = `ig-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  // SCRAPER_PROVIDER + EMBEDDINGS_PROVIDER default to 'fake' in test → no
  // Apify token / OpenAI key needed; the whole import runs deterministically.
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

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

  it('imports posts → documents + chunks, and is idempotent', async () => {
    const res = await post(operatorToken, { handle: '@faustobassan', limit: 3 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      handle: string;
      status: string;
      docs: { total: number; inserted: number; duplicate: number };
      chunks: { created: number };
    };
    expect(body.status).toBe('indexed');
    expect(body.docs.inserted).toBeGreaterThan(0);
    expect(body.chunks.created).toBeGreaterThan(0);

    const db = getDb(DB_URL);
    const docCount = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.creatorId, creatorId));
    expect(docCount.length).toBe(body.docs.inserted);

    // The content_source shows up indexed (Studio "Fontes").
    const [src] = await db
      .select({ kind: contentSources.kind, status: contentSources.status })
      .from(contentSources)
      .where(eq(contentSources.creatorId, creatorId))
      .limit(1);
    expect(src).toMatchObject({ kind: 'instagram', status: 'indexed' });

    // Re-import: same captions → all duplicates, no new docs.
    const second = (await (
      await post(operatorToken, { handle: '@faustobassan', limit: 3 })
    ).json()) as {
      docs: { inserted: number; duplicate: number };
    };
    expect(second.docs.inserted).toBe(0);
    expect(second.docs.duplicate).toBeGreaterThan(0);
    const after = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.creatorId, creatorId));
    expect(after.length).toBe(docCount.length);
  });
});

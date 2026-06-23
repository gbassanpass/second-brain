import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, users } from '../src/db/schema.js';
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
  console.warn('[creators-create-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/creators + ownership (self-signup, F1.x)', () => {
  const authIds: string[] = [];
  const createdSlugs: string[] = [];
  let foreignCreatorId = '';
  let foreignSlug = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provisionAuthId(): Promise<{ authId: string; token: string }> {
    const authId = randomUUID();
    await getDb(DB_URL).execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`new-${authId.slice(0, 8)}@example.com`})`,
    );
    authIds.push(authId);
    return { authId, token: signJwtForTesting({ sub: authId }, JWT_SECRET) };
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    // A creator owned by nobody-relevant (someone else), to test the 403 path.
    foreignSlug = `foreign-${randomUUID().slice(0, 8)}`;
    const c = await ensureCreatorBySlug(db, foreignSlug, 'Foreign Creator');
    foreignCreatorId = c.id;
  }, 15000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (createdSlugs.length > 0) {
      await db.delete(creators).where(inArray(creators.slug, createdSlugs));
    }
    if (foreignCreatorId) await db.delete(creators).where(eq(creators.id, foreignCreatorId));
    if (authIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, authIds));
      for (const id of authIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    await closeDb();
  }, 15000);

  it('401 without a JWT', async () => {
    const res = await app.request('/api/creators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'X' }),
    });
    expect(res.status).toBe(401);
  });

  it('creates a clone owned by the user, promotes role to creator', async () => {
    const { authId, token } = await provisionAuthId();
    const res = await app.request('/api/creators', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Ana Souza', niche: 'fé' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; slug: string; displayName: string };
    expect(body.slug).toBe('ana-souza');
    expect(body.displayName).toBe('Ana Souza');
    createdSlugs.push(body.slug);

    const db = getDb(DB_URL);
    const [row] = await db
      .select({ owner: creators.ownerUserId, role: users.role })
      .from(creators)
      .innerJoin(users, eq(users.id, creators.ownerUserId))
      .where(eq(creators.slug, body.slug))
      .limit(1);
    expect(row?.role).toBe('creator'); // promoted from subscriber
    expect(row?.owner).not.toBeNull();

    // Owner can read their own Studio…
    const ownRes = await app.request(`/api/creators/${body.slug}/sources`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ownRes.status).toBe(200);

    // …but NOT a creator they don't own (403).
    const foreignRes = await app.request(`/api/creators/${foreignSlug}/sources`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(foreignRes.status).toBe(403);

    // Re-creating with the same name returns the same clone (no duplicate).
    const again = await app.request('/api/creators', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Ana Souza' }),
    });
    expect(((await again.json()) as { slug: string }).slug).toBe(body.slug);
    void authId;
  });

  it('makes a unique slug when the name collides', async () => {
    const { token } = await provisionAuthId();
    const res = await app.request('/api/creators', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Ana Souza' }), // 'ana-souza' already taken
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('ana-souza-2');
    createdSlugs.push(body.slug);
  });
});

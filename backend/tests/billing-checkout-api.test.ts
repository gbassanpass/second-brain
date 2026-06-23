import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, users } from '../src/db/schema.js';

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
  console.warn('[billing-checkout-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/billing/checkout — hosted checkout (E6.3)', () => {
  const provisionedAuthIds: string[] = [];
  let creatorId = '';
  let creatorSlug = '';
  let authId = '';
  const buildApp = () => createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    creatorSlug = `e63-${randomUUID().slice(0, 8)}`;
    const [creator] = await db
      .insert(creators)
      .values({ slug: creatorSlug, displayName: 'Checkout Creator' })
      .returning({ id: creators.id });
    if (!creator) throw new Error('failed to seed creator');
    creatorId = creator.id;

    authId = randomUUID();
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`e63-${authId.slice(0, 8)}@example.com`})`,
    );
    provisionedAuthIds.push(authId);
  }, 15000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (provisionedAuthIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, provisionedAuthIds));
      for (const id of provisionedAuthIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    await closeDb();
  }, 15000);

  it('returns 401 without a JWT', async () => {
    const res = await buildApp().request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatorSlug }),
    });
    expect(res.status).toBe(401);
  });

  it('returns a checkout url for an authenticated user (fake provider)', async () => {
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; externalId: string | null };
    // FakeBilling returns the default success url and a deterministic session id.
    expect(body.url).toContain(`/c/${creatorSlug}/chat?checkout=success`);
    expect(body.externalId).toMatch(/^cs_fake_/);
  });

  it('honors an explicit successUrl/cancelUrl', async () => {
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        creatorSlug,
        successUrl: 'https://app.example/ok',
        cancelUrl: 'https://app.example/no',
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toBe('https://app.example/ok');
  });

  it('returns 404 for an unknown creator slug', async () => {
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: '__unknown__' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 on an invalid body', async () => {
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorSlug: '', successUrl: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });
});

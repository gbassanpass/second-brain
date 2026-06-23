import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, subscriptions, users } from '../src/db/schema.js';

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
  console.warn('[access-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('GET /api/c/:slug/access — paywall middleware', () => {
  const provisionedAuthIds: string[] = [];
  const userIds: string[] = [];
  let creatorId = '';
  let creatorSlug = '';
  const buildApp = () => createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provisionUser(role: 'subscriber' | 'creator' | 'operator'): Promise<{
    authId: string;
    userId: string;
  }> {
    const authId = randomUUID();
    const email = `e52-api-${role}-${authId.slice(0, 8)}@example.com`;
    const db = getDb(DB_URL);
    await db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${email})`);
    provisionedAuthIds.push(authId);
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.externalId, authId))
      .limit(1);
    if (!row) throw new Error('failed to provision user');
    userIds.push(row.id);
    return { authId, userId: row.id };
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    creatorSlug = `e52-api-${randomUUID().slice(0, 8)}`;
    const [creator] = await db
      .insert(creators)
      .values({ slug: creatorSlug, displayName: 'Access API' })
      .returning({ id: creators.id });
    if (!creator) throw new Error('failed to seed creator');
    creatorId = creator.id;
  }, 15000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (userIds.length > 0)
      await db.delete(subscriptions).where(inArray(subscriptions.userId, userIds));
    if (provisionedAuthIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, provisionedAuthIds));
      for (const id of provisionedAuthIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    await closeDb();
  }, 15000);

  it('returns 401 when Authorization header is missing', async () => {
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown creator slug', async () => {
    const { authId } = await provisionUser('subscriber');
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request('/api/c/__unknown__/access', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 402 with paywall payload when subscriber has no subscription', async () => {
    const { authId } = await provisionUser('subscriber');
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as {
      error: string;
      reason: string;
      creatorSlug: string;
      checkout: { url: string | null; message: string };
    };
    expect(body.error).toBe('payment_required');
    expect(body.reason).toBe('no_subscription');
    expect(body.creatorSlug).toBe(creatorSlug);
    expect(body.checkout.url).toBeNull();
    expect(body.checkout.message).toContain(creatorSlug);
  });

  it('returns 402 (expired_subscription) for a canceled sub', async () => {
    const { authId, userId } = await provisionUser('subscriber');
    await getDb(DB_URL)
      .insert(subscriptions)
      .values({
        creatorId,
        userId,
        plan: 'mvp-monthly',
        status: 'canceled',
        provider: 'stripe',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('expired_subscription');
  });

  it('returns 200 for a subscriber with an active subscription', async () => {
    const { authId, userId } = await provisionUser('subscriber');
    await getDb(DB_URL)
      .insert(subscriptions)
      .values({
        creatorId,
        userId,
        plan: 'mvp-monthly',
        status: 'active',
        provider: 'stripe',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      allowed: boolean;
      creatorSlug: string;
      reason: string;
      subscriptionId: string | null;
    };
    expect(body.allowed).toBe(true);
    expect(body.creatorSlug).toBe(creatorSlug);
    expect(body.reason).toBe('active_subscription');
    expect(body.subscriptionId).not.toBeNull();
  });

  it('operator role bypasses the paywall without a subscription row', async () => {
    const { authId } = await provisionUser('operator');
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reason: string; subscriptionId: string | null };
    expect(body.reason).toBe('operator_role');
    expect(body.subscriptionId).toBeNull();
  });

  it('creator role bypasses the paywall without a subscription row', async () => {
    const { authId } = await provisionUser('creator');
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const res = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('creator_role');
  });
});

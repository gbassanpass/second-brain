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
  console.warn('[billing-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/billing/webhook — billing webhook (E5.3)', () => {
  const provisionedAuthIds: string[] = [];
  let creatorId = '';
  let creatorSlug = '';
  let userId = '';
  let authId = '';
  let externalId = '';
  const buildApp = () => createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  // Fake provider (BILLING_PROVIDER=fake in tests) skips signature checks, so a
  // plain Stripe-shaped JSON body is enough to exercise the full route.
  function event(type: string, status: string, currentPeriodEnd: number | null): string {
    return JSON.stringify({
      id: `evt_${randomUUID().slice(0, 8)}`,
      type,
      data: {
        object: {
          id: externalId,
          object: 'subscription',
          status,
          current_period_end: currentPeriodEnd,
          metadata: { user_id: userId, creator_id: creatorId, plan: 'mvp-monthly' },
        },
      },
    });
  }

  function post(body: string) {
    return buildApp().request('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    creatorSlug = `e53-${randomUUID().slice(0, 8)}`;
    const [creator] = await db
      .insert(creators)
      .values({ slug: creatorSlug, displayName: 'Billing API' })
      .returning({ id: creators.id });
    if (!creator) throw new Error('failed to seed creator');
    creatorId = creator.id;

    authId = randomUUID();
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`e53-${authId.slice(0, 8)}@example.com`})`,
    );
    provisionedAuthIds.push(authId);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.externalId, authId))
      .limit(1);
    if (!row) throw new Error('auth trigger did not provision user');
    userId = row.id;
    externalId = `sub_${randomUUID().slice(0, 12)}`;
  }, 15000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    if (provisionedAuthIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, provisionedAuthIds));
      for (const id of provisionedAuthIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    await closeDb();
  }, 15000);

  // externalId is a fresh uuid per run, so it uniquely identifies this test's
  // subscription. The FakeBilling provider replays Stripe-shaped payloads, so
  // the persisted `provider` is 'stripe'.
  async function subRows() {
    return getDb(DB_URL)
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.externalId, externalId));
  }

  it('ignores unrelated event types with a 200 ack', async () => {
    const res = await post(
      JSON.stringify({ id: 'evt_inv', type: 'invoice.paid', data: { object: { id: 'in_1' } } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, ignored: true });
  });

  it('rejects a malformed payload with 400', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_payload');
  });

  it('creates a subscription and grants access', async () => {
    const future = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const res = await post(event('customer.subscription.created', 'active', future));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { action: string; subscriptionId: string };
    expect(body.action).toBe('inserted');

    const rows = await subRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');

    // Paywall now lets this subscriber through.
    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const accessRes = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(accessRes.status).toBe(200);
    expect(((await accessRes.json()) as { reason: string }).reason).toBe('active_subscription');
  });

  it('reprocesses the same subscription idempotently (no duplicate)', async () => {
    const future = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const res = await post(event('customer.subscription.updated', 'active', future));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { action: string }).action).toBe('updated');

    const rows = await subRows();
    expect(rows).toHaveLength(1);
  });

  it('cancellation flips status and blocks access', async () => {
    const res = await post(event('customer.subscription.deleted', 'canceled', null));
    expect(res.status).toBe(200);

    const rows = await subRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('canceled');

    const token = signJwtForTesting({ sub: authId }, JWT_SECRET);
    const accessRes = await buildApp().request(`/api/c/${creatorSlug}/access`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(accessRes.status).toBe(402);
    expect(((await accessRes.json()) as { reason: string }).reason).toBe('expired_subscription');
  });
});

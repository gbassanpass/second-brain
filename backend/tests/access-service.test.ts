import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, subscriptions, users } from '../src/db/schema.js';
import { checkAccess } from '../src/services/access.js';

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
  console.warn('[access-service] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('checkAccess — paywall logic', () => {
  const provisionedAuthIds: string[] = [];
  let creatorId = '';
  const userIds: string[] = [];

  async function provisionUser(role: 'subscriber' | 'creator' | 'operator'): Promise<string> {
    const authId = randomUUID();
    const email = `e52-${role}-${authId.slice(0, 8)}@example.com`;
    const db = getDb(DB_URL);
    await db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${email})`);
    provisionedAuthIds.push(authId);
    // Trigger created the row — update role.
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.externalId, authId))
      .limit(1);
    if (!row) throw new Error('failed to provision user');
    userIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const slug = `e52-creator-${randomUUID().slice(0, 8)}`;
    const [creator] = await db
      .insert(creators)
      .values({ slug, displayName: 'Access Test' })
      .returning({ id: creators.id });
    if (!creator) throw new Error('failed to seed creator');
    creatorId = creator.id;
  }, 15000);

  afterAll(async () => {
    if (provisionedAuthIds.length === 0 && !creatorId) return;
    const db = getDb(DB_URL);
    if (provisionedAuthIds.length > 0) {
      await db.delete(subscriptions).where(inArray(subscriptions.userId, userIds));
      await db.delete(users).where(inArray(users.externalId, provisionedAuthIds));
      for (const id of provisionedAuthIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    if (creatorId) {
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  async function insertSub(
    userId: string,
    status: string,
    currentPeriodEnd: Date | null,
  ): Promise<void> {
    const db = getDb(DB_URL);
    await db.insert(subscriptions).values({
      creatorId,
      userId,
      plan: 'mvp-monthly',
      status,
      provider: 'stripe',
      currentPeriodEnd,
    });
  }

  it('operator role bypasses the paywall', async () => {
    const userId = await provisionUser('operator');
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'operator',
      creatorId,
    });
    expect(decision).toEqual({ allowed: true, reason: 'operator_role' });
  });

  it('creator role bypasses the paywall', async () => {
    const userId = await provisionUser('creator');
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'creator',
      creatorId,
    });
    expect(decision).toEqual({ allowed: true, reason: 'creator_role' });
  });

  it('subscriber with active subscription passes', async () => {
    const userId = await provisionUser('subscriber');
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await insertSub(userId, 'active', future);
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('active_subscription');
    expect(decision.subscriptionId).toBeDefined();
  });

  it('trialing subscription also passes', async () => {
    const userId = await provisionUser('subscriber');
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await insertSub(userId, 'trialing', future);
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('active_subscription');
  });

  it('subscriber with no subscription row is blocked (no_subscription)', async () => {
    const userId = await provisionUser('subscriber');
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
    });
    expect(decision).toEqual({ allowed: false, reason: 'no_subscription' });
  });

  it('canceled subscription is blocked (expired_subscription)', async () => {
    const userId = await provisionUser('subscriber');
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await insertSub(userId, 'canceled', future);
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('expired_subscription');
    expect(decision.subscriptionId).toBeDefined();
  });

  it('past_period subscription is blocked even if status=active', async () => {
    const userId = await provisionUser('subscriber');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await insertSub(userId, 'active', past);
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('expired_subscription');
  });

  it('respects the injected clock', async () => {
    const userId = await provisionUser('subscriber');
    const periodEnd = new Date(Date.now() + 1000); // very near future
    await insertSub(userId, 'active', periodEnd);
    // Now() pinned to 1h after period end → should expire.
    const later = periodEnd.getTime() + 60 * 60 * 1000;
    const decision = await checkAccess(getDb(DB_URL), {
      userId,
      userRole: 'subscriber',
      creatorId,
      now: () => later,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('expired_subscription');
  });
});

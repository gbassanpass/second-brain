import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { accessCodes, accessGrants, creators, users } from '../src/db/schema.js';

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
  console.warn('[access-codes-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('Access codes (F1.17)', () => {
  const slug = `code-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  const userIds: string[] = [];
  let operatorToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator' | 'subscriber' | 'creator'): Promise<{
    token: string;
    userId: string;
  }> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`ac-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.externalId, authId))
      .limit(1);
    if (!row) throw new Error('failed to provision');
    authIds.push(authId);
    userIds.push(row.id);
    return { token: signJwtForTesting({ sub: authId }, JWT_SECRET), userId: row.id };
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const [creator] = await db
      .insert(creators)
      .values({ slug, displayName: 'Code Creator' })
      .returning({ id: creators.id });
    if (!creator) throw new Error('failed to seed creator');
    creatorId = creator.id;
    operatorToken = (await provision('operator')).token;
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(accessGrants).where(eq(accessGrants.creatorId, creatorId));
      await db.delete(accessCodes).where(eq(accessCodes.creatorId, creatorId));
    }
    if (authIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, authIds));
      for (const id of authIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    await closeDb();
  }, 15000);

  function createCode(token: string, body: unknown = {}) {
    return app.request(`/api/creators/${slug}/access-codes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
  function redeem(token: string, code: string) {
    return app.request(`/api/c/${slug}/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
  }
  function checkAccessHttp(token: string) {
    return app.request(`/api/c/${slug}/access`, { headers: { authorization: `Bearer ${token}` } });
  }

  it('only the owner (operator) can create/list codes', async () => {
    // anon
    expect((await createCode('')).status).toBe(401);
    // a creator who doesn't own this clone
    const other = await provision('creator');
    expect((await createCode(other.token)).status).toBe(403);
    // a plain subscriber
    const sub = await provision('subscriber');
    expect((await createCode(sub.token)).status).toBe(403);

    const created = await createCode(operatorToken, { label: 'Lançamento' });
    expect(created.status).toBe(201);
    const { code } = (await created.json()) as { code: { code: string; label: string } };
    expect(code.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(code.label).toBe('Lançamento');

    const listed = await app.request(`/api/creators/${slug}/access-codes`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(listed.status).toBe(200);
    const { codes } = (await listed.json()) as { codes: { code: string }[] };
    expect(codes.some((x) => x.code === code.code)).toBe(true);
  });

  it('a blocked subscriber redeems a code and gains access', async () => {
    const sub = await provision('subscriber');
    // blocked before redeeming
    expect((await checkAccessHttp(sub.token)).status).toBe(402);

    const { code } = (await (await createCode(operatorToken)).json()) as {
      code: { code: string };
    };
    const r = await redeem(sub.token, code.code.toLowerCase()); // case-insensitive
    expect(r.status).toBe(200);
    expect((await r.json()) as { redeemed: boolean }).toMatchObject({ redeemed: true });

    // now allowed, reason access_code
    const after = await checkAccessHttp(sub.token);
    expect(after.status).toBe(200);
    expect((await after.json()) as { reason: string }).toMatchObject({ reason: 'access_code' });

    // redeeming again is an idempotent no-op success
    const again = await redeem(sub.token, code.code);
    expect(again.status).toBe(200);
    expect((await again.json()) as { alreadyGranted: boolean }).toMatchObject({
      alreadyGranted: true,
    });
  });

  it('422 for an unknown code, and a deactivated code stops working', async () => {
    const sub = await provision('subscriber');
    const bad = await redeem(sub.token, 'NOPECODE');
    expect(bad.status).toBe(422);
    expect((await bad.json()) as { reason: string }).toMatchObject({ reason: 'not_found' });

    const { code } = (await (await createCode(operatorToken)).json()) as {
      code: { id: string; code: string };
    };
    // owner deactivates it
    const patched = await app.request(`/api/creators/${slug}/access-codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${operatorToken}` },
      body: JSON.stringify({ active: false }),
    });
    expect(patched.status).toBe(200);

    const r = await redeem(sub.token, code.code);
    expect(r.status).toBe(422);
    expect((await r.json()) as { reason: string }).toMatchObject({ reason: 'inactive' });
  });

  it('enforces maxRedemptions across users', async () => {
    const { code } = (await (await createCode(operatorToken, { maxRedemptions: 1 })).json()) as {
      code: { code: string };
    };
    const a = await provision('subscriber');
    const b = await provision('subscriber');
    expect((await redeem(a.token, code.code)).status).toBe(200);
    const second = await redeem(b.token, code.code);
    expect(second.status).toBe(422);
    expect((await second.json()) as { reason: string }).toMatchObject({ reason: 'exhausted' });
  });
});

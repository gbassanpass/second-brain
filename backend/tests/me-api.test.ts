import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';

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
  console.warn('[me-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('GET /api/me + on_auth_user_created trigger', () => {
  const provisionedAuthIds: string[] = [];
  let buildApp: () => ReturnType<typeof createApp>;

  beforeAll(() => {
    buildApp = () =>
      createApp({
        getDb: () => getDb(DB_URL),
        jwtSecret: JWT_SECRET,
      });
  });

  afterAll(async () => {
    if (provisionedAuthIds.length > 0) {
      const db = getDb(DB_URL);
      await db.delete(users).where(inArray(users.externalId, provisionedAuthIds));
      // auth.users isn't modeled by Drizzle — drop it via raw SQL one row at a time.
      for (const id of provisionedAuthIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    await closeDb();
  }, 15000);

  /** Inserts a fresh row into auth.users, lets the trigger replicate it, and returns the IDs. */
  async function provisionAuthUser(email: string): Promise<{ authId: string }> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${email})`);
    provisionedAuthIds.push(authId);
    return { authId };
  }

  it('trigger: inserting into auth.users replicates into public.users with role=subscriber', async () => {
    const email = `e51-trigger-${randomUUID().slice(0, 8)}@example.com`;
    const { authId } = await provisionAuthUser(email);

    const db = getDb(DB_URL);
    const [row] = await db
      .select({ id: users.id, externalId: users.externalId, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.externalId, authId));
    expect(row?.externalId).toBe(authId);
    expect(row?.email).toBe(email);
    expect(row?.role).toBe('subscriber');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await buildApp().request('/api/me', { method: 'GET' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('unauthorized');
    expect(body.reason).toBe('missing_authorization_header');
  });

  it('returns 401 when the bearer token is malformed', async () => {
    const res = await buildApp().request('/api/me', {
      method: 'GET',
      headers: { authorization: 'Bearer not.a.jwt.token' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/^jwt_/);
  });

  it('returns 401 when the JWT signature is invalid', async () => {
    const token = signJwtForTesting({ sub: randomUUID() }, 'wrong-secret-32-characters-padding!');
    const res = await buildApp().request('/api/me', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('jwt_bad_signature');
  });

  it('returns 401 when the JWT sub does not match any public.users row', async () => {
    const token = signJwtForTesting({ sub: randomUUID() }, JWT_SECRET);
    const res = await buildApp().request('/api/me', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('user_not_provisioned');
  });

  it('returns the authenticated user when given a valid signed JWT', async () => {
    const email = `e51-me-${randomUUID().slice(0, 8)}@example.com`;
    const { authId } = await provisionAuthUser(email);

    const token = signJwtForTesting({ sub: authId, email }, JWT_SECRET);
    const res = await buildApp().request('/api/me', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      externalId: string;
      email: string;
      role: string;
    };
    expect(body.externalId).toBe(authId);
    expect(body.email).toBe(email);
    expect(body.role).toBe('subscriber');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, users } from '../src/db/schema.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { FakeVoiceSynth } from '../src/voice/fake.js';

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
  console.warn('[voice-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/voice (F1.3)', () => {
  const slug = `voice-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({
    getDb: () => getDb(DB_URL),
    jwtSecret: JWT_SECRET,
    getVoice: () => new FakeVoiceSynth(),
  });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`vc-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Voice Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    if (authIds.length > 0) {
      await db.delete(users).where(inArray(users.externalId, authIds));
      for (const id of authIds) {
        await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
      }
    }
    await closeDb();
  }, 15000);

  function post(token: string | null, body: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    return app.request('/api/voice', { method: 'POST', headers, body: JSON.stringify(body) });
  }

  it('401 anon, 402 subscriber without subscription, 400 invalid', async () => {
    expect((await post(null, { creatorSlug: slug, text: 'oi' })).status).toBe(401);
    // A plain subscriber with no active subscription is paywalled.
    expect((await post(subscriberToken, { creatorSlug: slug, text: 'oi' })).status).toBe(402);
    expect((await post(operatorToken, { creatorSlug: slug, text: '' })).status).toBe(400);
  });

  it('413 when the text exceeds the char cap', async () => {
    const res = await post(operatorToken, { creatorSlug: slug, text: 'a'.repeat(6000) });
    expect(res.status).toBe(413);
  });

  it('returns audio/mpeg bytes for an allowed user', async () => {
    const res = await post(operatorToken, {
      creatorSlug: slug,
      text: 'Olá, eu sou a mente digital do criador.',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('audio/mpeg');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    // FakeVoiceSynth starts every clip with an MP3 frame header.
    expect(bytes[0]).toBe(0xff);
  });
});

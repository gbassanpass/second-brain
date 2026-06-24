import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents, users } from '../src/db/schema.js';
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
  console.warn('[training-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/creators/:slug/train (F1.12)', () => {
  const slug = `train-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`tr-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Train Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
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
    return app.request(`/api/creators/${slug}/train`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  it('401 anon, 403 subscriber, 400 invalid', async () => {
    expect(
      (
        await app.request(`/api/creators/${slug}/train`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401);
    expect((await post(subscriberToken, { question: 'q', answer: 'a' })).status).toBe(403);
    expect((await post(operatorToken, { question: '', answer: '' })).status).toBe(400);
  });

  it('persists the correction as an indexed Q&A document', async () => {
    const res = await post(operatorToken, {
      question: 'O que você acha de faculdade?',
      answer: 'Vá só se for aprender de verdade; senão, economiza o dinheiro.',
      rating: 'nada',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { learned: boolean; documentId: string; chunkCount: number };
    expect(body.learned).toBe(true);
    expect(body.chunkCount).toBeGreaterThan(0);

    const db = getDb(DB_URL);
    const [doc] = await db
      .select({ kind: documents.kind, rawText: documents.rawText })
      .from(documents)
      .where(eq(documents.id, body.documentId))
      .limit(1);
    expect(doc?.kind).toBe('qa');
    expect(doc?.rawText).toContain('economiza o dinheiro');
    // The question is embedded too so retrieval matches on it.
    expect(doc?.rawText).toContain('faculdade');

    const counted = await db
      .select({ value: sql<number>`count(*)` })
      .from(chunks)
      .where(eq(chunks.documentId, body.documentId));
    expect(Number(counted[0]?.value ?? 0)).toBe(body.chunkCount);
  });
});

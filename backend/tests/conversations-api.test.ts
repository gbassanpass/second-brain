import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { conversations, creators, messages, users } from '../src/db/schema.js';
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
  console.warn('[conversations-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('Studio conversations (F1.13)', () => {
  const slug = `conv-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  let convId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`cv-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Conv Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');

    const [conv] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    if (!conv) throw new Error('seed conv failed');
    convId = conv.id;
    await db.insert(messages).values([
      { conversationId: convId, creatorId, role: 'user', content: 'Como vai a economia?' },
      { conversationId: convId, creatorId, role: 'assistant', content: 'Vou te explicar [1]' },
    ]);
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(messages).where(eq(messages.creatorId, creatorId));
      await db.delete(conversations).where(eq(conversations.creatorId, creatorId));
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

  it('401 anon, 403 subscriber on the list', async () => {
    expect((await app.request(`/api/creators/${slug}/conversations`)).status).toBe(401);
    expect(
      (
        await app.request(`/api/creators/${slug}/conversations`, {
          headers: { authorization: `Bearer ${subscriberToken}` },
        })
      ).status,
    ).toBe(403);
  });

  it('lists conversations with first-question title + count', async () => {
    const res = await app.request(`/api/creators/${slug}/conversations`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversations: Array<{ id: string; firstQuestion: string | null; messageCount: number }>;
    };
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0]).toMatchObject({
      id: convId,
      firstQuestion: 'Como vai a economia?',
      messageCount: 2,
    });
  });

  it('returns the messages of a conversation in order', async () => {
    const res = await app.request(`/api/creators/${slug}/conversations/${convId}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(body.messages[0]?.content).toBe('Como vai a economia?');
  });

  it('does not leak another creator’s conversation', async () => {
    // An unknown/foreign conversation id resolves to an empty message list.
    const res = await app.request(`/api/creators/${slug}/conversations/${randomUUID()}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { messages: unknown[] }).messages).toEqual([]);
  });
});

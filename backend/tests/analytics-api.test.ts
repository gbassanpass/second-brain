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
  console.warn('[analytics-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('GET /api/creators/:slug/analytics (E6.5)', () => {
  const slug = `e65-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`an-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Analytics Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');

    // 2 conversations. Conv A: 2 user turns (one repeated question) + 2 answers,
    // one of them investment-flagged. Conv B: 1 user + 1 answer.
    const [convA] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    const [convB] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    if (!convA || !convB) throw new Error('seed conversations failed');

    await db.insert(messages).values([
      { conversationId: convA.id, creatorId, role: 'user', content: 'eleições?' },
      {
        conversationId: convA.id,
        creatorId,
        role: 'assistant',
        content: 'resposta [1]',
        model: 'claude-haiku-4-5',
        costUsd: '0.00100',
        latencyMs: 1000,
      },
      { conversationId: convA.id, creatorId, role: 'user', content: 'que cripto comprar?' },
      {
        conversationId: convA.id,
        creatorId,
        role: 'assistant',
        content: 'modo educacional',
        model: 'claude-haiku-4-5',
        costUsd: '0.00300',
        latencyMs: 3000,
        guardrailFlag: 'investment',
      },
      { conversationId: convB.id, creatorId, role: 'user', content: 'eleições?' },
      {
        conversationId: convB.id,
        creatorId,
        role: 'assistant',
        content: 'outra resposta [1]',
        model: 'claude-haiku-4-5',
        costUsd: '0.00200',
        latencyMs: 2000,
      },
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

  it('401 anon, 403 subscriber', async () => {
    expect((await app.request(`/api/creators/${slug}/analytics`)).status).toBe(401);
    expect(
      (
        await app.request(`/api/creators/${slug}/analytics`, {
          headers: { authorization: `Bearer ${subscriberToken}` },
        })
      ).status,
    ).toBe(403);
  });

  it('aggregates conversations, cost, guardrail rate and top questions', async () => {
    const res = await app.request(`/api/creators/${slug}/analytics`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const a = (await res.json()) as {
      conversations: number;
      userMessages: number;
      assistantMessages: number;
      totalCostUsd: number;
      avgCostUsdPerAnswer: number;
      avgLatencyMs: number;
      guardrailInvestmentCount: number;
      guardrailRate: number;
      topQuestions: Array<{ question: string; count: number }>;
    };
    expect(a.conversations).toBe(2);
    expect(a.userMessages).toBe(3);
    expect(a.assistantMessages).toBe(3);
    expect(a.totalCostUsd).toBeCloseTo(0.006, 6);
    expect(a.avgCostUsdPerAnswer).toBeCloseTo(0.002, 6);
    expect(a.avgLatencyMs).toBe(2000);
    expect(a.guardrailInvestmentCount).toBe(1);
    expect(a.guardrailRate).toBeCloseTo(1 / 3, 6);
    // "eleições?" asked twice → top.
    expect(a.topQuestions[0]).toEqual({ question: 'eleições?', count: 2 });
  });

  it('exposes daily activity (30 pts) and content gaps from refusals', async () => {
    const db = getDb(DB_URL);
    const [conv] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    if (!conv) throw new Error('conv failed');
    // Distinct timestamps so the user turn precedes the assistant refusal
    // (real chat inserts them ms apart in separate statements).
    await db.insert(messages).values([
      {
        conversationId: conv.id,
        creatorId,
        role: 'user',
        content: 'qual sua comida favorita?',
        createdAt: new Date(Date.now() - 2000),
      },
      {
        conversationId: conv.id,
        creatorId,
        role: 'assistant',
        content: 'Não tenho isso registrado nos conteúdos de Fausto.',
        retrievedChunks: null,
        createdAt: new Date(Date.now() - 1000),
      },
    ]);

    const res = await app.request(`/api/creators/${slug}/analytics`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const a = (await res.json()) as {
      dailyActivity: { date: string; messages: number; conversations: number }[];
      contentGaps: { question: string; count: number }[];
      answerRate: number;
    };
    expect(a.dailyActivity).toHaveLength(30);
    expect(a.dailyActivity.at(-1)?.messages ?? 0).toBeGreaterThan(0); // today has activity
    expect(a.contentGaps.some((g) => g.question === 'qual sua comida favorita?')).toBe(true);
    expect(a.answerRate).toBeLessThan(1); // one refusal lowers the rate
  });
});

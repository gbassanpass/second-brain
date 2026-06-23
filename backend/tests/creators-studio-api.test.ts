import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, contentSources, creators, documents, users } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
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
  console.warn('[creators-studio-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('Studio read endpoints — sources/documents (E6.4)', () => {
  const slug = `e64-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  let documentId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`studio-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Studio Creator');
    creatorId = creator.id;
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');

    await db.insert(contentSources).values({ creatorId, kind: 'upload', status: 'indexed' });

    const [doc] = await db
      .insert(documents)
      .values({
        creatorId,
        rawText: 'um texto qualquer para o studio',
        contentHash: randomUUID().replace(/-/g, ''),
        title: 'Doc do Studio',
        kind: 'article',
      })
      .returning({ id: documents.id });
    if (!doc) throw new Error('seed doc failed');
    documentId = doc.id;

    const embeds = await new FakeEmbedder({ dimensions: 1536 }).embed(['a', 'b']);
    await db.insert(chunks).values(
      embeds.map((embedding, i) => ({
        creatorId,
        documentId,
        ordinal: i,
        text: `chunk ${i}`,
        embedding,
        tokenCount: 3,
      })),
    );
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
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

  it('GET sources: 401 anon, 403 subscriber, 200 operator', async () => {
    expect((await app.request(`/api/creators/${slug}/sources`)).status).toBe(401);
    expect(
      (
        await app.request(`/api/creators/${slug}/sources`, {
          headers: { authorization: `Bearer ${subscriberToken}` },
        })
      ).status,
    ).toBe(403);
    const res = await app.request(`/api/creators/${slug}/sources`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: Array<{ kind: string; status: string }> };
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({ kind: 'upload', status: 'indexed' });
  });

  it('GET documents returns chunk counts (operator)', async () => {
    const res = await app.request(`/api/creators/${slug}/documents`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      documents: Array<{ id: string; title: string | null; chunkCount: number }>;
    };
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]).toMatchObject({ title: 'Doc do Studio', chunkCount: 2 });
  });

  it('GET documents: 403 for a subscriber', async () => {
    const res = await app.request(`/api/creators/${slug}/documents`, {
      headers: { authorization: `Bearer ${subscriberToken}` },
    });
    expect(res.status).toBe(403);
  });
});

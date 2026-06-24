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
  console.warn('[document-detail-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('GET /api/creators/:slug/documents/:id (F1.9 detail)', () => {
  const slug = `docd-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  let documentId = '';
  const authIds: string[] = [];
  let operatorToken = '';
  const app = createApp({ getDb: () => getDb(DB_URL), jwtSecret: JWT_SECRET });

  async function provision(role: 'operator'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`dd-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Doc Detail');
    creatorId = creator.id;
    const [doc] = await db
      .insert(documents)
      .values({
        creatorId,
        title: 'Sobre geopolítica',
        kind: 'article',
        url: 'https://example.com/post',
        rawText: 'O conteúdo completo do documento sobre geopolítica.',
        contentHash: randomUUID(),
      })
      .returning({ id: documents.id });
    if (!doc) throw new Error('doc seed failed');
    documentId = doc.id;
    await db.insert(chunks).values({ creatorId, documentId, ordinal: 0, text: 'trecho um' });
    operatorToken = await provision('operator');
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

  it('401 anon, 404 unknown id, 200 with full content for the owner', async () => {
    expect((await app.request(`/api/creators/${slug}/documents/${documentId}`)).status).toBe(401);

    const unknown = await app.request(`/api/creators/${slug}/documents/${randomUUID()}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(unknown.status).toBe(404);

    const res = await app.request(`/api/creators/${slug}/documents/${documentId}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      title: string;
      kind: string;
      url: string;
      text: string;
      chunks: string[];
    };
    expect(body.title).toBe('Sobre geopolítica');
    expect(body.url).toBe('https://example.com/post');
    expect(body.text).toContain('conteúdo completo');
    expect(body.chunks).toContain('trecho um');
  });
});

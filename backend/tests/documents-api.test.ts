import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, documents } from '../src/db/schema.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';

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
  console.warn('[documents-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('POST /api/creators/:slug/documents', () => {
  const slug = `test-api-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const app = createApp({ getDb: () => getDb(DB_URL) });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test API Creator');
    creatorId = creator.id;
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('creates a document on first call (201) and dedupes on the second (200)', async () => {
    const body = JSON.stringify({
      rawText: 'POST de integração — content hash do raw_text',
      title: 'Fixture',
      kind: 'caption',
    });

    const first = await app.request(`/api/creators/${slug}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(first.status).toBe(201);
    const a = (await first.json()) as { id: string; contentHash: string; created: boolean };
    expect(a.created).toBe(true);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const second = await app.request(`/api/creators/${slug}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(second.status).toBe(200);
    const b = (await second.json()) as { id: string; contentHash: string; created: boolean };
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    expect(b.contentHash).toBe(a.contentHash);

    const db = getDb(DB_URL);
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.creatorId, creatorId), eq(documents.contentHash, a.contentHash)));
    expect(rows).toHaveLength(1);
  });

  it('returns 400 with Zod issues for an invalid body', async () => {
    const res = await app.request(`/api/creators/${slug}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawText: '', kind: 'invalid-kind' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string[] }[] };
    expect(body.error).toBe('invalid_body');
    expect(body.issues.some((i) => i.path.includes('rawText'))).toBe(true);
  });

  it('returns 404 for an unknown creator slug', async () => {
    const res = await app.request('/api/creators/__nonexistent__/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawText: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('accepts and stores publishedAt as a Date', async () => {
    const res = await app.request(`/api/creators/${slug}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rawText: 'doc com publishedAt',
        publishedAt: '2026-04-01T12:00:00Z',
      }),
    });
    expect(res.status).toBe(201);
    const a = (await res.json()) as { id: string };

    const db = getDb(DB_URL);
    const [row] = await db.select().from(documents).where(eq(documents.id, a.id));
    expect(row?.publishedAt?.toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });
});

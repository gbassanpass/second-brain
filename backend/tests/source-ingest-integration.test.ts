import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, contentSources, creators, documents } from '../src/db/schema.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { ensureManualSource, syncContentSource } from '../src/services/source-ingest.js';

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
  console.warn('[source-ingest] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('syncContentSource (integration)', () => {
  const slug = `test-source-${randomUUID().slice(0, 8)}`;
  const embedder = new FakeEmbedder({ dimensions: 1536 });
  let creatorId = '';
  let sourceId = '';
  let dataDir = '';

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Source');
    creatorId = creator.id;
    const source = await ensureManualSource(db, creatorId);
    sourceId = source.id;

    dataDir = await mkdtemp(join(tmpdir(), 'source-ingest-'));
    await mkdir(join(dataDir, 'posts'), { recursive: true });
    await writeFile(join(dataDir, 'posts', 'a.md'), 'primeiro documento', 'utf8');
    await writeFile(join(dataDir, 'posts', 'b.md'), 'segundo documento', 'utf8');
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    await closeDb();
  }, 15000);

  async function readStatus(): Promise<string | null> {
    const db = getDb(DB_URL);
    const [row] = await db
      .select({ status: contentSources.status })
      .from(contentSources)
      .where(eq(contentSources.id, sourceId));
    return row?.status ?? null;
  }

  it('transitions status pending → indexed and writes chunks', async () => {
    const db = getDb(DB_URL);
    expect(await readStatus()).toBe('pending');

    const result = await syncContentSource(db, embedder, sourceId, { dataDir });
    expect(result.sourceId).toBe(sourceId);
    expect(result.status).toBe('indexed');
    expect(result.docs.total).toBe(2);
    expect(result.docs.inserted).toBe(2);
    expect(result.chunks.created).toBeGreaterThanOrEqual(2);
    expect(await readStatus()).toBe('indexed');

    const docRows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.creatorId, creatorId));
    expect(docRows).toHaveLength(2);

    const chunkRows = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.creatorId, creatorId));
    expect(chunkRows.length).toBeGreaterThanOrEqual(2);

    const [src] = await db
      .select({ lastSyncedAt: contentSources.lastSyncedAt })
      .from(contentSources)
      .where(eq(contentSources.id, sourceId));
    expect(src?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('is idempotent — re-running does not duplicate docs or chunks', async () => {
    const db = getDb(DB_URL);
    const before = (
      await db.select({ id: chunks.id }).from(chunks).where(eq(chunks.creatorId, creatorId))
    ).length;

    const result = await syncContentSource(db, embedder, sourceId, { dataDir });
    expect(result.docs.inserted).toBe(0);
    expect(result.docs.duplicate).toBe(2);
    expect(result.chunks.created).toBe(0);

    const after = (
      await db.select({ id: chunks.id }).from(chunks).where(eq(chunks.creatorId, creatorId))
    ).length;
    expect(after).toBe(before);
  });

  it('flips status to error and rethrows when the connector kind is unsupported', async () => {
    const db = getDb(DB_URL);
    const [other] = await db
      .insert(contentSources)
      .values({ creatorId, kind: 'phyllo', status: 'pending' })
      .returning({ id: contentSources.id });
    if (!other) throw new Error('seed failed');

    await expect(syncContentSource(db, embedder, other.id, { dataDir })).rejects.toThrow(
      /no connector for source kind/,
    );

    const [src] = await db
      .select({ status: contentSources.status })
      .from(contentSources)
      .where(eq(contentSources.id, other.id));
    expect(src?.status).toBe('error');
  });

  it('throws a clear error for an unknown sourceId', async () => {
    const db = getDb(DB_URL);
    await expect(
      syncContentSource(db, embedder, '11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow(/source not found/);
  });
});

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ManualUploadConnector } from '../src/connectors/manual.js';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents } from '../src/db/schema.js';
import { ensureCreatorBySlug, upsertDocument } from '../src/services/documents.js';

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
  console.warn('[ingest-integration] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('ingest-fausto-like flow (integration)', () => {
  const slug = `test-ingest-${randomUUID().slice(0, 8)}`;
  let baseDir = '';
  let creatorId = '';

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'ingest-int-'));
    await mkdir(join(baseDir, 'posts'), { recursive: true });
    await writeFile(join(baseDir, 'posts', 'p1.md'), 'primeiro post', 'utf8');
    await writeFile(join(baseDir, 'posts', 'p2.md'), 'segundo post', 'utf8');
    await writeFile(join(baseDir, 'transcripts.txt'), 'transcript solto na raiz', 'utf8');

    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Creator');
    creatorId = creator.id;
  }, 15000);

  afterAll(async () => {
    if (!creatorId) {
      await closeDb().catch(() => undefined);
      return;
    }
    const db = getDb(DB_URL);
    // chunks → documents → creator (FK cascade handles chunks via documents).
    await db.delete(documents).where(eq(documents.creatorId, creatorId));
    await db.delete(creators).where(eq(creators.id, creatorId));
    await rm(baseDir, { recursive: true, force: true });
    await closeDb();
  }, 15000);

  async function ingest(): Promise<{ inserted: number; duplicate: number }> {
    const db = getDb(DB_URL);
    const connector = new ManualUploadConnector({ baseDir });
    let inserted = 0;
    let duplicate = 0;
    for await (const raw of connector.list(creatorId)) {
      const r = await upsertDocument(db, {
        creatorId,
        rawText: raw.rawText,
        kind: raw.kind,
        title: raw.title,
        url: raw.url,
        publishedAt: raw.publishedAt,
      });
      if (r.created) inserted++;
      else duplicate++;
    }
    return { inserted, duplicate };
  }

  it('writes one document per file on the first run, with sha256 content_hash', async () => {
    const first = await ingest();
    expect(first.inserted).toBe(3);
    expect(first.duplicate).toBe(0);

    const db = getDb(DB_URL);
    const rows = await db.select().from(documents).where(eq(documents.creatorId, creatorId));
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.creatorId).toBe(creatorId);
    }
    expect(new Set(rows.map((r) => r.contentHash)).size).toBe(3);
  });

  it('deduplicates by (creator_id, content_hash) on a second run', async () => {
    const second = await ingest();
    expect(second.inserted).toBe(0);
    expect(second.duplicate).toBe(3);

    const db = getDb(DB_URL);
    const rows = await db.select().from(documents).where(eq(documents.creatorId, creatorId));
    expect(rows).toHaveLength(3);
  });

  it('treats edited text as a new document (different content_hash)', async () => {
    await writeFile(join(baseDir, 'posts', 'p1.md'), 'primeiro post EDITADO', 'utf8');
    const third = await ingest();
    // Only p1.md changed → 1 new doc; p2.md and transcripts.txt stay the same.
    expect(third.inserted).toBe(1);
    expect(third.duplicate).toBe(2);

    const db = getDb(DB_URL);
    const rows = await db.select().from(documents).where(eq(documents.creatorId, creatorId));
    expect(rows).toHaveLength(4);
  });

  it('leaves no orphan chunks for the test creator (none should exist yet)', async () => {
    const db = getDb(DB_URL);
    const rows = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.creatorId, creatorId));
    expect(rows).toHaveLength(0);
  });

  it('upsertDocument returns the same row on the duplicate path', async () => {
    const db = getDb(DB_URL);
    const first = await upsertDocument(db, {
      creatorId,
      rawText: 'idempotência check',
    });
    const second = await upsertDocument(db, {
      creatorId,
      rawText: 'idempotência check',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.document.id).toBe(first.document.id);
    expect(second.contentHash).toBe(first.contentHash);

    // Cleanup so afterAll's delete doesn't have to do extra work.
    await db
      .delete(documents)
      .where(and(eq(documents.creatorId, creatorId), eq(documents.contentHash, first.contentHash)));
  });
});

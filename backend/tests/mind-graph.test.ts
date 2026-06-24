import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents } from '../src/db/schema.js';
import { getMindGraph } from '../src/services/mind-graph.js';

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
  console.warn('[mind-graph] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('getMindGraph (F1.18)', () => {
  const db = getDb(DB_URL);
  let creatorId = '';

  afterAll(async () => {
    if (creatorId) {
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('builds creator → documents → chunks with correct nodes/links', async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `graph-${randomUUID().slice(0, 8)}`, displayName: 'Graph Test' })
      .returning({ id: creators.id });
    if (!c) throw new Error('seed failed');
    creatorId = c.id;

    // 3 documents, 2 chunks each = 6 chunks.
    const docIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [d] = await db
        .insert(documents)
        .values({ creatorId, rawText: `d${i}`, title: `Doc ${i}`, contentHash: randomUUID() })
        .returning({ id: documents.id });
      if (!d) throw new Error('doc failed');
      docIds.push(d.id);
      for (let j = 0; j < 2; j++) {
        await db
          .insert(chunks)
          .values({ creatorId, documentId: d.id, ordinal: j, text: `c${i}-${j}` });
      }
    }

    const g = await getMindGraph(db, creatorId);
    // 1 creator + 3 docs + 6 chunks = 10 nodes; 3 (creator→doc) + 6 (doc→chunk) = 9 links.
    expect(g.nodes).toHaveLength(10);
    expect(g.links).toHaveLength(9);
    expect(g.nodes.filter((n) => n.type === 'creator')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.type === 'document')).toHaveLength(3);
    expect(g.nodes.filter((n) => n.type === 'chunk')).toHaveLength(6);
    expect(g.stats).toMatchObject({ documents: 3, chunks: 6, shownChunks: 6 });
    expect(g.truncated).toBe(false);

    // Every chunk link points from a real document node.
    const docNodeIds = new Set(g.nodes.filter((n) => n.type === 'document').map((n) => n.id));
    const chunkLinks = g.links.filter((l) => l.source.startsWith('doc:'));
    expect(chunkLinks.every((l) => docNodeIds.has(l.source))).toBe(true);
  });

  it('caps chunks and flags truncated', async () => {
    const g = await getMindGraph(db, creatorId, { maxChunks: 4 });
    expect(g.truncated).toBe(true);
    expect(g.stats.chunks).toBe(6); // true total
    expect(g.stats.shownChunks).toBe(4); // capped
    expect(g.nodes.filter((n) => n.type === 'chunk')).toHaveLength(4);
  });
});

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents, kgEntities, kgRelations } from '../src/db/schema.js';
import { formatSubgraph, retrieveSubgraph } from '../src/services/kg-retrieve.js';

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
  console.warn('[kg-retrieve] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('retrieveSubgraph (F1.5.2)', () => {
  const db = getDb(DB_URL);
  let creatorId = '';
  let chunk1 = '';
  let chunk2 = '';

  beforeAll(async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `kgr-${randomUUID().slice(0, 8)}`, displayName: 'KGR' })
      .returning({ id: creators.id });
    if (!c) throw new Error('seed failed');
    creatorId = c.id;
    const [doc] = await db
      .insert(documents)
      .values({ creatorId, rawText: 'd', contentHash: randomUUID() })
      .returning({ id: documents.id });
    if (!doc) throw new Error('doc failed');
    const [a] = await db
      .insert(chunks)
      .values({ creatorId, documentId: doc.id, ordinal: 0, text: 'sobre stablecoins' })
      .returning({ id: chunks.id });
    const [b] = await db
      .insert(chunks)
      .values({ creatorId, documentId: doc.id, ordinal: 1, text: 'sobre análise' })
      .returning({ id: chunks.id });
    chunk1 = a?.id ?? '';
    chunk2 = b?.id ?? '';

    const ents = await db
      .insert(kgEntities)
      .values([
        { creatorId, name: 'Stablecoins', kind: 'tema' },
        { creatorId, name: 'Poupança de países emergentes', kind: 'tema' },
        { creatorId, name: 'Fausto', kind: 'pessoa' },
        { creatorId, name: 'análise fria de fenômenos', kind: 'heuristica' },
      ])
      .returning({ id: kgEntities.id, name: kgEntities.name });
    const id = (n: string) => ents.find((e) => e.name === n)?.id ?? '';
    await db.insert(kgRelations).values([
      {
        creatorId,
        srcId: id('Stablecoins'),
        dstId: id('Poupança de países emergentes'),
        relation: 'pode_ameaçar',
        confidence: 0.85,
        sourceChunk: chunk1,
      },
      {
        creatorId,
        srcId: id('Fausto'),
        dstId: id('análise fria de fenômenos'),
        relation: 'utiliza',
        confidence: 0.9,
        sourceChunk: chunk2,
      },
    ]);
  }, 30000);

  afterAll(async () => {
    if (creatorId) {
      await db.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
      await db.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('pulls relations by provenance (source chunk in the hit set)', async () => {
    const facts = await retrieveSubgraph(db, {
      creatorId,
      query: 'pergunta genérica sem entidades',
      chunkIds: [chunk1],
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ src: 'Stablecoins', dst: 'Poupança de países emergentes' });
    expect(formatSubgraph(facts)[0]).toContain('pode ameaçar');
  });

  it('pulls relations by lexical match (entity name in the question)', async () => {
    const facts = await retrieveSubgraph(db, {
      creatorId,
      query: 'o que você acha das Stablecoins hoje?',
      chunkIds: [],
    });
    expect(facts.some((f) => f.src === 'Stablecoins')).toBe(true);
  });

  it('returns nothing when neither provenance nor lexical match', async () => {
    const facts = await retrieveSubgraph(db, {
      creatorId,
      query: 'tema totalmente diferente xyz',
      chunkIds: [],
    });
    expect(facts).toHaveLength(0);
  });
});

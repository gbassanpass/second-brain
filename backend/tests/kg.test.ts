import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, creators, documents, kgEntities, kgRelations } from '../src/db/schema.js';
import { FakeLLM } from '../src/llm/fake.js';
import { buildGraphForCreator, getKnowledgeGraph } from '../src/services/kg-build.js';
import { KgExtractError, extractGraphFromText } from '../src/services/kg-extract.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

const GRAPH_JSON =
  '{"entities":[{"name":"Trump","kind":"pessoa"},{"name":"incerteza","kind":"tema"}],"relations":[{"src":"Trump","relation":"decide_por","dst":"incerteza","confidence":0.6}]}';

describe('extractGraphFromText (F1.5.1) — no DB', () => {
  it('parses a valid LLM JSON into entities + relations', async () => {
    const llm = new FakeLLM({ reply: () => GRAPH_JSON });
    const g = await extractGraphFromText(llm, {
      creatorName: 'X',
      text: 'algum trecho',
      model: 'fake',
    });
    expect(g.entities).toHaveLength(2);
    expect(g.relations).toHaveLength(1);
    expect(g.relations[0]).toMatchObject({
      src: 'Trump',
      relation: 'decide_por',
      dst: 'incerteza',
    });
  });

  it('throws KgExtractError on non-JSON output', async () => {
    const llm = new FakeLLM({ reply: () => 'desculpa, não sei' });
    await expect(
      extractGraphFromText(llm, { creatorName: 'X', text: 't', model: 'fake' }),
    ).rejects.toBeInstanceOf(KgExtractError);
  });

  it('coerces an out-of-enum kind to "tema"', async () => {
    const llm = new FakeLLM({
      reply: () => '{"entities":[{"name":"X","kind":"banana"}],"relations":[]}',
    });
    const g = await extractGraphFromText(llm, { creatorName: 'X', text: 't', model: 'fake' });
    expect(g.entities[0]?.kind).toBe('tema');
  });
});

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
  console.warn('[kg] skipped DB suite — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('buildGraphForCreator (F1.5.1) — with DB', () => {
  const db = getDb(DB_URL);
  let creatorId = '';

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

  it('extracts and persists entities + relations, idempotently', async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `kg-${randomUUID().slice(0, 8)}`, displayName: 'KG Test' })
      .returning({ id: creators.id });
    if (!c) throw new Error('seed failed');
    creatorId = c.id;

    const [doc] = await db
      .insert(documents)
      .values({ creatorId, rawText: 'd', contentHash: randomUUID() })
      .returning({ id: documents.id });
    if (!doc) throw new Error('doc failed');
    for (let i = 0; i < 2; i++) {
      await db.insert(chunks).values({ creatorId, documentId: doc.id, ordinal: i, text: `t${i}` });
    }

    const llm = new FakeLLM({ reply: () => GRAPH_JSON });
    const r = await buildGraphForCreator(db, llm, {
      creatorId,
      creatorName: 'KG Test',
      model: 'fake',
    });
    expect(r.chunksProcessed).toBe(2);
    expect(r.chunksFailed).toBe(0);
    expect(r.entitiesCreated).toBe(2); // Trump + incerteza (deduped across chunks)
    expect(r.relationsCreated).toBe(2); // same triple, but one per source chunk

    const g = await getKnowledgeGraph(db, creatorId);
    expect(g.stats.entities).toBe(2);
    expect(g.stats.relations).toBe(2);
    expect(g.relations[0]).toMatchObject({
      src: 'Trump',
      dst: 'incerteza',
      relation: 'decide_por',
    });
    expect(g.relations[0]?.confidence).toBeCloseTo(0.6, 5);

    // Re-running creates nothing new (idempotent).
    const again = await buildGraphForCreator(db, llm, {
      creatorId,
      creatorName: 'KG Test',
      model: 'fake',
    });
    expect(again.entitiesCreated).toBe(0);
    expect(again.relationsCreated).toBe(0);
  });

  it('captures a dated relation into valid_from → year (F1.5.5)', async () => {
    const dated = new FakeLLM({
      reply: () =>
        '{"entities":[{"name":"Lula","kind":"pessoa"},{"name":"Eleições","kind":"evento"}],"relations":[{"src":"Lula","relation":"venceu","dst":"Eleições","confidence":0.95,"year":2022}]}',
    });
    await buildGraphForCreator(db, dated, { creatorId, creatorName: 'KG Test', model: 'fake' });
    const g = await getKnowledgeGraph(db, creatorId);
    const rel = g.relations.find((r) => r.relation === 'venceu');
    expect(rel?.year).toBe(2022);
  });
});

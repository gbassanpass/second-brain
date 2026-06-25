import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, kgEntities, kgRelations } from '../src/db/schema.js';
import type { LLMClient, LLMResult } from '../src/llm/base.js';
import {
  generateSuggestedQuestions,
  getSuggestedQuestions,
} from '../src/services/suggested-questions.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

function fakeLLM(content: string): LLMClient {
  return {
    provider: 'fake',
    async complete(): Promise<LLMResult> {
      return { content, model: 'fake', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

describe('suggested questions (F1.20)', () => {
  const db = getDb(DB_URL);
  let creatorId: string;

  beforeAll(async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `sq-${Date.now()}`, displayName: 'Teste SQ' })
      .returning({ id: creators.id });
    creatorId = c?.id ?? '';
    // A tiny graph: two themes linked by a relation (gives them degree > 0).
    const ents = await db
      .insert(kgEntities)
      .values([
        { creatorId, name: 'stablecoins', kind: 'tema' },
        { creatorId, name: 'geopolítica', kind: 'tema' },
      ])
      .returning({ id: kgEntities.id });
    await db.insert(kgRelations).values({
      creatorId,
      srcId: ents[0]?.id ?? '',
      dstId: ents[1]?.id ?? '',
      relation: 'relaciona',
      confidence: 0.9,
    });
  });

  afterAll(async () => {
    await db.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
    await db.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
    await db.delete(creators).where(eq(creators.id, creatorId));
    await closeDb();
  });

  it('generates from the graph, caches, and reads back', async () => {
    const llm = fakeLLM('["O que você acha das stablecoins?", "Como você lê a geopolítica hoje?"]');
    const generated = await generateSuggestedQuestions(db, llm, {
      creatorId,
      creatorName: 'Teste SQ',
      model: 'm',
    });
    expect(generated.length).toBe(2);
    expect(generated[0]).toContain('stablecoins');

    // Persisted → readable without the LLM.
    const cached = await getSuggestedQuestions(db, creatorId);
    expect(cached).toEqual(generated);
  });

  it('returns [] when the creator has no graph themes', async () => {
    const [empty] = await db
      .insert(creators)
      .values({ slug: `sq-empty-${Date.now()}`, displayName: 'Vazio' })
      .returning({ id: creators.id });
    const id = empty?.id ?? '';
    const out = await generateSuggestedQuestions(db, fakeLLM('["nope"]'), {
      creatorId: id,
      creatorName: 'Vazio',
      model: 'm',
    });
    expect(out).toEqual([]);
    expect(await getSuggestedQuestions(db, id)).toEqual([]);
    await db.delete(creators).where(eq(creators.id, id));
  });
});

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { chunks, conversations, creators, documents, messages } from '../src/db/schema.js';
import { getMindScore } from '../src/services/mind-score.js';

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
  console.warn('[mind-score] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('getMindScore (F1.14)', () => {
  const db = getDb(DB_URL);
  let creatorId = '';

  afterAll(async () => {
    if (creatorId) {
      await db.delete(messages).where(eq(messages.creatorId, creatorId));
      await db.delete(conversations).where(eq(conversations.creatorId, creatorId));
      await db.delete(chunks).where(eq(chunks.creatorId, creatorId));
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('starts at iniciante for an empty clone (no persona, no knowledge)', async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `mind-${randomUUID().slice(0, 8)}`, displayName: 'Mind Test' })
      .returning({ id: creators.id });
    if (!c) throw new Error('seed failed');
    creatorId = c.id;

    const s = await getMindScore(db, creatorId);
    expect(s.score).toBe(0);
    expect(s.level).toBe('iniciante');
    expect(s.components.persona.present).toBe(false);
    expect(s.nextStep).toContain('persona');
  });

  it('scores persona + knowledge + training + confidence from real data', async () => {
    // Persona present (+15).
    await db
      .update(creators)
      .set({ personaCard: { name: 'X', one_liner: 'y', voice: ['z'] } })
      .where(eq(creators.id, creatorId));

    // 10 documents (5 of them Q&A corrections). documents=10 → +8; qa=5 → training +8.
    const docIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const [d] = await db
        .insert(documents)
        .values({
          creatorId,
          rawText: `doc ${i}`,
          kind: i < 5 ? 'qa' : 'article',
          contentHash: randomUUID(),
        })
        .returning({ id: documents.id });
      if (d) docIds.push(d.id);
    }

    // 25 chunks under the first doc → ramp(25,50,35)=18.
    const firstDoc = docIds[0];
    if (!firstDoc) throw new Error('no doc');
    for (let i = 0; i < 25; i++) {
      await db
        .insert(chunks)
        .values({ creatorId, documentId: firstDoc, ordinal: i, text: `c${i}` });
    }

    // 4 assistant answers, 3 with retrieved context → confidence rate 0.75 → +15.
    const [conv] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    if (!conv) throw new Error('no conv');
    for (let i = 0; i < 4; i++) {
      await db.insert(messages).values({
        creatorId,
        conversationId: conv.id,
        role: 'assistant',
        content: `a${i}`,
        retrievedChunks: i < 3 ? [{ chunkId: firstDoc, documentId: firstDoc, ordinal: 0 }] : null,
      });
    }

    const s = await getMindScore(db, creatorId);
    expect(s.components.persona.points).toBe(15);
    expect(s.components.knowledge.chunks).toBe(25);
    expect(s.components.knowledge.documents).toBe(10);
    expect(s.components.knowledge.points).toBe(26); // 18 (chunks) + 8 (docs)
    expect(s.components.training.corrections).toBe(5);
    expect(s.components.training.points).toBe(8);
    expect(s.components.confidence.answers).toBe(4);
    expect(s.components.confidence.answered).toBe(3);
    expect(s.components.confidence.points).toBe(15);
    expect(s.score).toBe(64);
    expect(s.level).toBe('experiente');
  });
});

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { contentIdeas, conversations, creators, messages } from '../src/db/schema.js';
import { FakeLLM } from '../src/llm/fake.js';
import {
  generateContentIdeas,
  generateIdeaScript,
  listContentIdeas,
} from '../src/services/content-ideas.js';

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
  console.warn('[content-ideas] skipped — DATABASE_URL not reachable (run `make up`).');
}

// One LLM that returns ideas JSON normally, and a markdown roteiro when asked
// as a "roteirista".
const llm = new FakeLLM({
  reply: (args) =>
    args.system?.includes('roteirista')
      ? '# Roteiro\n**Gancho**: olha isso'
      : '{"ideas":[{"title":"Pauta A","angle":"faça X","basedOn":"lacuna","sourceQuestion":"como investir?"}]}',
});

describe.skipIf(!dbReachable)('content ideas (persistência + roteiro)', () => {
  const db = getDb(DB_URL);
  let creatorId = '';

  afterAll(async () => {
    if (creatorId) {
      await db.delete(contentIdeas).where(eq(contentIdeas.creatorId, creatorId));
      await db.delete(messages).where(eq(messages.creatorId, creatorId));
      await db.delete(conversations).where(eq(conversations.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('gera, persiste e gera o roteiro sob demanda (com cache)', async () => {
    const [c] = await db
      .insert(creators)
      .values({ slug: `ci-${randomUUID().slice(0, 8)}`, displayName: 'CI', niche: 'finanças' })
      .returning({ id: creators.id });
    if (!c) throw new Error('seed failed');
    creatorId = c.id;
    const [conv] = await db
      .insert(conversations)
      .values({ creatorId })
      .returning({ id: conversations.id });
    if (!conv) throw new Error('conv failed');
    await db
      .insert(messages)
      .values({ conversationId: conv.id, creatorId, role: 'user', content: 'como investir?' });

    const ideas = await generateContentIdeas(db, llm, { creatorId, model: 'fake' });
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ title: 'Pauta A', basedOn: 'lacuna', script: null });
    expect(ideas[0]?.sourceQuestion).toBe('como investir?');

    // persisted → listable
    const stored = await listContentIdeas(db, creatorId);
    expect(stored).toHaveLength(1);
    const ideaId = stored[0]?.id ?? '';

    // re-generating dedupes by title (still 1)
    await generateContentIdeas(db, llm, { creatorId, model: 'fake' });
    expect(await listContentIdeas(db, creatorId)).toHaveLength(1);

    // script on demand
    const withScript = await generateIdeaScript(db, llm, { creatorId, ideaId, model: 'fake' });
    expect(withScript?.script).toContain('Roteiro');

    // cached: second call without force doesn't change it
    const callsBefore = llm.calls.length;
    const again = await generateIdeaScript(db, llm, { creatorId, ideaId, model: 'fake' });
    expect(again?.script).toContain('Roteiro');
    expect(llm.calls.length).toBe(callsBefore); // no new LLM call (cache hit)

    // foreign id → null
    expect(
      await generateIdeaScript(db, llm, { creatorId, ideaId: randomUUID(), model: 'fake' }),
    ).toBeNull();
  });
});

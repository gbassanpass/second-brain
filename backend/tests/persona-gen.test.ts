import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, documents } from '../src/db/schema.js';
import { FakeLLM } from '../src/llm/fake.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { PersonaGenError, generatePersonaCard } from '../src/services/persona-gen.js';
import { getPersonaCard } from '../src/services/persona.js';

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
  console.warn('[persona-gen] skipped — DATABASE_URL not reachable (run `make up`).');
}

// LLM that returns a persona card WITHOUT the investment guardrail / disclaimer,
// to prove the service forces them in.
const cardJson = JSON.stringify({
  name: 'IGNORADO',
  one_liner: 'Explico o mundo sem torcer.',
  voice: ['didático', 'direto'],
  frameworks: ['quem ganha o quê'],
  do: ['explicar sem viés'],
  dont: ['tomar lado partidário'],
  catchphrases: ['sem torcer'],
});

describe.skipIf(!dbReachable)('generatePersonaCard (F1.x)', () => {
  const slug = `pgen-${randomUUID().slice(0, 8)}`;
  let creatorId = '';

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const c = await ensureCreatorBySlug(db, slug, 'Persona Gen Creator');
    creatorId = c.id;
    await db.insert(documents).values({
      creatorId,
      rawText: 'Antes de escolher um vilão, pergunte quem ganha o quê. Explico sem torcer.',
      contentHash: randomUUID().replace(/-/g, ''),
      kind: 'caption',
    });
  }, 30000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) {
      await db.delete(documents).where(eq(documents.creatorId, creatorId));
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('generates + persists a card, forces name + CVM guardrail', async () => {
    const llm = new FakeLLM({ reply: () => `\`\`\`json\n${cardJson}\n\`\`\`` });
    const card = await generatePersonaCard(getDb(DB_URL), llm, {
      creatorId,
      slug,
      displayName: 'Persona Gen Creator',
      niche: 'geopolítica',
      model: 'claude-haiku-4-5',
    });
    // Name is forced to the real creator name (not the LLM's value).
    expect(card.name).toBe('Persona Gen Creator');
    expect(card.voice).toContain('didático');
    // Guardrail forced in regardless of what the LLM returned.
    expect(card.dont.some((d) => /investimento|ativos/i.test(d))).toBe(true);
    expect(card.disclaimer).toContain('não é recomendação de investimento');

    // Persisted.
    const saved = await getPersonaCard(getDb(DB_URL), slug);
    expect(saved?.one_liner).toBe('Explico o mundo sem torcer.');
  });

  it('retries then throws on persistently invalid JSON', async () => {
    const llm = new FakeLLM({ reply: () => 'desculpe, não consigo' });
    await expect(
      generatePersonaCard(getDb(DB_URL), llm, {
        creatorId,
        slug,
        displayName: 'Persona Gen Creator',
        model: 'claude-haiku-4-5',
      }),
    ).rejects.toThrow(PersonaGenError);
  });

  it('throws when the creator has no content', async () => {
    const db = getDb(DB_URL);
    const empty = await ensureCreatorBySlug(db, `pgen-empty-${randomUUID().slice(0, 8)}`, 'Empty');
    const llm = new FakeLLM({ reply: () => cardJson });
    await expect(
      generatePersonaCard(db, llm, {
        creatorId: empty.id,
        slug: empty.slug,
        displayName: 'Empty',
        model: 'claude-haiku-4-5',
      }),
    ).rejects.toThrow(/no content/);
    await db.delete(creators).where(eq(creators.id, empty.id));
  });
});

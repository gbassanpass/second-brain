import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators } from '../src/db/schema.js';
import { type PersonaCard, personaCardSchema } from '../src/rag/persona.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { getPersonaCard, setPersonaCard } from '../src/services/persona.js';

// --- Pure schema tests ---------------------------------------------------

describe('personaCardSchema (pure)', () => {
  const validCard: PersonaCard = {
    name: 'Tester',
    one_liner: 'um teste',
    voice: ['didático'],
    frameworks: [],
    do: [],
    dont: [],
    catchphrases: [],
  };

  it('accepts a minimal card and applies array defaults', () => {
    const parsed = personaCardSchema.parse({
      name: 'Tester',
      one_liner: 'um teste',
      voice: ['didático'],
    });
    expect(parsed).toEqual(validCard);
  });

  it('rejects empty name / one_liner / voice', () => {
    expect(personaCardSchema.safeParse({ ...validCard, name: '' }).success).toBe(false);
    expect(personaCardSchema.safeParse({ ...validCard, one_liner: '' }).success).toBe(false);
    expect(personaCardSchema.safeParse({ ...validCard, voice: [] }).success).toBe(false);
  });

  it('rejects unknown keys (strict mode catches typos)', () => {
    const r = personaCardSchema.safeParse({ ...validCard, vibe: 'leve' });
    expect(r.success).toBe(false);
  });
});

// --- Integration: service + HTTP route -----------------------------------

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
  console.warn('[persona] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('persona service + route (integration)', () => {
  const slug = `test-persona-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const app = createApp({
    getDb: () => getDb(DB_URL),
    enqueueSync: async () => ({ jobId: 'noop' }),
  });

  const validCard: PersonaCard = {
    name: 'Test Persona',
    one_liner: 'persona de teste',
    voice: ['neutro'],
    frameworks: ['quem ganha o quê'],
    do: ['explicar'],
    dont: ['recomendar investimento'],
    catchphrases: ['sem torcer'],
    disclaimer: 'apenas teste',
  };

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Test Persona Creator');
    creatorId = creator.id;
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      const db = getDb(DB_URL);
      await db.delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('GET returns 404 before the persona is set', async () => {
    const res = await app.request(`/api/creators/${slug}/persona`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('persona_not_set');
  });

  it('PUT validates the body and 400s on invalid input', async () => {
    const res = await app.request(`/api/creators/${slug}/persona`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', one_liner: 'x', voice: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT writes the persona and GET reads it back', async () => {
    const putRes = await app.request(`/api/creators/${slug}/persona`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validCard),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { slug: string; personaCard: PersonaCard };
    expect(putBody.slug).toBe(slug);
    expect(putBody.personaCard).toEqual(validCard);

    const getRes = await app.request(`/api/creators/${slug}/persona`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { slug: string; personaCard: PersonaCard };
    expect(getBody.personaCard).toEqual(validCard);
  });

  it('PUT 404s for unknown creator', async () => {
    const res = await app.request('/api/creators/__nonexistent__/persona', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validCard),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('creator_not_found');
  });

  it('service round-trip applies defaults for missing arrays', async () => {
    const db = getDb(DB_URL);
    const minimal = { name: 'X', one_liner: 'y', voice: ['z'] } as PersonaCard;
    const written = await setPersonaCard(db, slug, minimal);
    expect('error' in written).toBe(false);

    const read = await getPersonaCard(db, slug);
    expect(read).toEqual({
      name: 'X',
      one_liner: 'y',
      voice: ['z'],
      frameworks: [],
      do: [],
      dont: [],
      catchphrases: [],
    });
  });
});

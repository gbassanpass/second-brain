import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signJwtForTesting } from '../src/auth/jwt.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators, users } from '../src/db/schema.js';
import { type PersonaCard, personaCardSchema } from '../src/rag/persona.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { getPersonaCard, setPersonaCard } from '../src/services/persona.js';

const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

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
  // Persona routes are creator/operator-only (E6.4).
  const authIds: string[] = [];
  let operatorToken = '';
  let subscriberToken = '';
  const app = createApp({
    getDb: () => getDb(DB_URL),
    jwtSecret: JWT_SECRET,
    enqueueSync: async () => ({ jobId: 'noop' }),
  });

  async function provision(role: 'operator' | 'subscriber'): Promise<string> {
    const authId = randomUUID();
    const db = getDb(DB_URL);
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${authId}::uuid, ${`persona-${role}-${authId.slice(0, 8)}@example.com`})`,
    );
    await db.update(users).set({ role }).where(eq(users.externalId, authId));
    authIds.push(authId);
    return signJwtForTesting({ sub: authId }, JWT_SECRET);
  }

  const authHeaders = (token: string) => ({
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
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
    operatorToken = await provision('operator');
    subscriberToken = await provision('subscriber');
  }, 15000);

  afterAll(async () => {
    const db = getDb(DB_URL);
    if (creatorId) await db.delete(creators).where(eq(creators.id, creatorId));
    for (const id of authIds) {
      await db.delete(users).where(eq(users.externalId, id));
      await db.execute(sql`DELETE FROM auth.users WHERE id = ${id}::uuid`);
    }
    await closeDb();
  }, 15000);

  it('GET 401 without a JWT and 403 for a subscriber', async () => {
    const anon = await app.request(`/api/creators/${slug}/persona`);
    expect(anon.status).toBe(401);
    const sub = await app.request(`/api/creators/${slug}/persona`, {
      headers: authHeaders(subscriberToken),
    });
    expect(sub.status).toBe(403);
  });

  it('GET returns 404 before the persona is set', async () => {
    const res = await app.request(`/api/creators/${slug}/persona`, {
      headers: authHeaders(operatorToken),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('persona_not_set');
  });

  it('PUT validates the body and 400s on invalid input', async () => {
    const res = await app.request(`/api/creators/${slug}/persona`, {
      method: 'PUT',
      headers: authHeaders(operatorToken),
      body: JSON.stringify({ name: '', one_liner: 'x', voice: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT writes the persona and GET reads it back', async () => {
    const putRes = await app.request(`/api/creators/${slug}/persona`, {
      method: 'PUT',
      headers: authHeaders(operatorToken),
      body: JSON.stringify(validCard),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { slug: string; personaCard: PersonaCard };
    expect(putBody.slug).toBe(slug);
    expect(putBody.personaCard).toEqual(validCard);

    const getRes = await app.request(`/api/creators/${slug}/persona`, {
      headers: authHeaders(operatorToken),
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { slug: string; personaCard: PersonaCard };
    expect(getBody.personaCard).toEqual(validCard);
  });

  it('PUT 404s for unknown creator', async () => {
    const res = await app.request('/api/creators/__nonexistent__/persona', {
      method: 'PUT',
      headers: authHeaders(operatorToken),
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

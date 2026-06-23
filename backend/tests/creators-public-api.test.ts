import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/client.js';
import { creators } from '../src/db/schema.js';
import { ensureCreatorBySlug } from '../src/services/documents.js';
import { setPersonaCard } from '../src/services/persona.js';

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
  console.warn('[creators-public-api] skipped — DATABASE_URL not reachable (run `make up`).');
}

describe.skipIf(!dbReachable)('GET /api/creators/:slug — public landing data (E6.1)', () => {
  const slug = `e61-${randomUUID().slice(0, 8)}`;
  let creatorId = '';
  const app = createApp({ getDb: () => getDb(DB_URL) });

  beforeAll(async () => {
    const db = getDb(DB_URL);
    const creator = await ensureCreatorBySlug(db, slug, 'Landing Creator');
    creatorId = creator.id;
    await db.update(creators).set({ niche: 'geopolítica' }).where(eq(creators.id, creatorId));
    await setPersonaCard(db, slug, {
      name: 'Landing Creator',
      one_liner: 'Explico o mundo sem torcer.',
      voice: ['didático'],
      frameworks: ['quem ganha o quê'],
      do: ['explicar sem viés'],
      dont: ['recomendar ativos'],
      catchphrases: ['sem torcer'],
      disclaimer: 'Conteúdo educativo; não é recomendação de investimento.',
    });
  }, 15000);

  afterAll(async () => {
    if (creatorId) {
      await getDb(DB_URL).delete(creators).where(eq(creators.id, creatorId));
    }
    await closeDb();
  }, 15000);

  it('returns the curated public profile', async () => {
    const res = await app.request(`/api/creators/${slug}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      displayName: string;
      niche: string | null;
      oneLiner: string | null;
      disclaimer: string | null;
    };
    expect(body.slug).toBe(slug);
    expect(body.displayName).toBe('Landing Creator');
    expect(body.niche).toBe('geopolítica');
    expect(body.oneLiner).toBe('Explico o mundo sem torcer.');
    expect(body.disclaimer).toContain('não é recomendação');
  });

  it('does not leak the full persona card (frameworks/do/dont)', async () => {
    const res = await app.request(`/api/creators/${slug}`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('frameworks');
    expect(body).not.toHaveProperty('do');
    expect(body).not.toHaveProperty('catchphrases');
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await app.request('/api/creators/__nope__');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('creator_not_found');
  });
});

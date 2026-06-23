import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { creators } from '../db/schema.js';
import { documentKindSchema } from '../db/types.js';
import { personaCardSchema } from '../rag/persona.js';
import { getPublicCreator, listDocuments, listSources } from '../services/creator.js';
import { upsertDocument } from '../services/documents.js';
import { getPersonaCard, setPersonaCard } from '../services/persona.js';
import {
  type AuthVariables,
  type RequireAuthDeps,
  requireAuth,
} from './middleware/require-auth.js';
import { requireRole } from './middleware/require-role.js';

const createDocumentBody = z.object({
  rawText: z.string().min(1),
  kind: documentKindSchema.optional(),
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
  sourceId: z.string().uuid().optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});

export type CreatorsRouterDeps = RequireAuthDeps;

export function createCreatorsRouter(deps: CreatorsRouterDeps): Hono<{ Variables: AuthVariables }> {
  const getDb = deps.getDb;
  const router = new Hono<{ Variables: AuthVariables }>();

  // Studio routes are creator/operator-only (E6.4). Applied per-method so the
  // public `GET /:slug` and the ingestion `POST /:slug/documents` stay open.
  const studioGate = [requireAuth(deps), requireRole('creator', 'operator')] as const;

  async function resolveCreatorId(slug: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    return row?.id ?? null;
  }

  // Public landing data (E6.1) — anonymous, no auth. Curated subset only.
  router.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const creator = await getPublicCreator(getDb(), slug);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug }, 404);
    }
    return c.json(creator);
  });

  // Studio: indexed content sources + documents (gated).
  router.get('/:slug/sources', ...studioGate, async (c) => {
    const creatorId = await resolveCreatorId(c.req.param('slug'));
    if (!creatorId) return c.json({ error: 'creator_not_found' }, 404);
    return c.json({ sources: await listSources(getDb(), creatorId) });
  });

  router.get('/:slug/documents', ...studioGate, async (c) => {
    const creatorId = await resolveCreatorId(c.req.param('slug'));
    if (!creatorId) return c.json({ error: 'creator_not_found' }, 404);
    return c.json({ documents: await listDocuments(getDb(), creatorId) });
  });

  router.post('/:slug/documents', async (c) => {
    const slug = c.req.param('slug');
    const json = await c.req.json().catch(() => null);
    const parsed = createDocumentBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    const db = getDb();
    const [creator] = await db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug }, 404);
    }

    const result = await upsertDocument(db, {
      creatorId: creator.id,
      rawText: parsed.data.rawText,
      kind: parsed.data.kind,
      title: parsed.data.title,
      url: parsed.data.url,
      sourceId: parsed.data.sourceId,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : undefined,
    });

    return c.json(
      {
        id: result.document.id,
        contentHash: result.contentHash,
        created: result.created,
      },
      result.created ? 201 : 200,
    );
  });

  // Persona Card is creator/operator-only — it carries the full prompt
  // material (do/dont/catchphrases) the public landing deliberately hides.
  router.get('/:slug/persona', ...studioGate, async (c) => {
    const slug = c.req.param('slug');
    const db = getDb();
    const [creator] = await db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug }, 404);
    }
    const card = await getPersonaCard(db, slug);
    if (!card) {
      return c.json({ error: 'persona_not_set', slug }, 404);
    }
    return c.json({ slug, personaCard: card });
  });

  router.put('/:slug/persona', ...studioGate, async (c) => {
    const slug = c.req.param('slug');
    const json = await c.req.json().catch(() => null);
    const parsed = personaCardSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const db = getDb();
    const result = await setPersonaCard(db, slug, parsed.data);
    if ('error' in result) {
      return c.json({ error: result.error, slug }, 404);
    }
    return c.json({ slug, personaCard: result.card });
  });

  return router;
}

import { eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { creators } from '../db/schema.js';
import { documentKindSchema } from '../db/types.js';
import type { LLMClient } from '../llm/base.js';
import { personaCardSchema } from '../rag/persona.js';
import { getCreatorAnalytics } from '../services/analytics.js';
import {
  createCreator,
  getPublicCreator,
  listDocuments,
  listSources,
  resolveOwnedCreator,
} from '../services/creator.js';
import { upsertDocument } from '../services/documents.js';
import { PersonaGenError, generatePersonaCard } from '../services/persona-gen.js';
import { getPersonaCard, setPersonaCard } from '../services/persona.js';
import { ensureInstagramSource } from '../services/source-ingest.js';
import {
  type AuthVariables,
  type RequireAuthDeps,
  requireAuth,
} from './middleware/require-auth.js';
import { requireRole } from './middleware/require-role.js';
import type { EnqueueSyncFn } from './sources.js';

const createDocumentBody = z.object({
  rawText: z.string().min(1),
  kind: documentKindSchema.optional(),
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
  sourceId: z.string().uuid().optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});

export interface CreatorsRouterDeps extends RequireAuthDeps {
  /** Enqueue the async ingestion job (BullMQ) for a content source. */
  enqueueSync?: EnqueueSyncFn;
  /** LLM for auto-generating the Persona Card from content (manual re-gen). */
  getLLM?: () => LLMClient;
  /** Model used for persona generation. */
  personaModel?: string;
}

const instagramBody = z.object({
  handle: z.string().min(1).max(120),
});

const createCreatorBody = z.object({
  displayName: z.string().min(1).max(120),
  niche: z.string().max(120).optional(),
});

export function createCreatorsRouter(deps: CreatorsRouterDeps): Hono<{ Variables: AuthVariables }> {
  const getDb = deps.getDb;
  const router = new Hono<{ Variables: AuthVariables }>();

  // Studio routes are creator/operator-only (E6.4). Applied per-method so the
  // public `GET /:slug` and the ingestion `POST /:slug/documents` stay open.
  const studioGate = [requireAuth(deps), requireRole('creator', 'operator')] as const;

  /**
   * Resolve the creator for a Studio route, enforcing ownership (F1.x). Returns
   * the creator id, or a 404/403 Response the handler should return as-is.
   */
  async function ownedCreatorId(
    c: Context<{ Variables: AuthVariables }>,
  ): Promise<string | Response> {
    const owned = await resolveOwnedCreator(getDb(), c.req.param('slug'), c.get('user'));
    if (owned.ok) return owned.creatorId;
    return c.json(
      { error: owned.status === 404 ? 'creator_not_found' : 'forbidden' },
      owned.status,
    );
  }

  // Self-signup: any authenticated user creates THEIR clone (F1.x). The user
  // becomes the owner and is promoted to `creator`.
  router.post('/', requireAuth(deps), async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = createCreatorBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const user = c.get('user');
    const created = await createCreator(getDb(), {
      displayName: parsed.data.displayName,
      niche: parsed.data.niche ?? null,
      ownerUserId: user.id,
    });
    return c.json(created, 201);
  });

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
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const creatorId = owned;
    return c.json({ sources: await listSources(getDb(), creatorId) });
  });

  router.get('/:slug/documents', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const creatorId = owned;
    return c.json({ documents: await listDocuments(getDb(), creatorId) });
  });

  // Studio analytics (E6.5): conversations, cost, top questions, guardrail rate.
  router.get('/:slug/analytics', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const creatorId = owned;
    return c.json(await getCreatorAnalytics(getDb(), creatorId));
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

  // Import public Instagram content by handle (F1.11) — gated. ASYNC: enqueues
  // a BullMQ job and returns immediately (202) so the user isn't blocked while
  // a big profile is scraped/indexed. The worker scrapes → indexes → trains the
  // persona; the Studio "Fontes" reflects status (pending → indexing → indexed).
  router.post('/:slug/sources/instagram', ...studioGate, async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = instagramBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    if (!deps.enqueueSync) {
      return c.json({ error: 'ingest_not_configured' }, 503);
    }
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;

    const source = await ensureInstagramSource(getDb(), owned, parsed.data.handle);
    const { jobId } = await deps.enqueueSync(source.id);
    return c.json(
      { sourceId: source.id, handle: parsed.data.handle, status: 'pending', jobId },
      202,
    );
  });

  // Persona Card is creator/operator-only — it carries the full prompt
  // material (do/dont/catchphrases) the public landing deliberately hides.
  router.get('/:slug/persona', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const slug = c.req.param('slug');
    const card = await getPersonaCard(getDb(), slug);
    if (!card) {
      return c.json({ error: 'persona_not_set', slug }, 404);
    }
    return c.json({ slug, personaCard: card });
  });

  router.put('/:slug/persona', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const slug = c.req.param('slug');
    const json = await c.req.json().catch(() => null);
    const parsed = personaCardSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const result = await setPersonaCard(getDb(), slug, parsed.data);
    if ('error' in result) {
      return c.json({ error: result.error, slug }, 404);
    }
    return c.json({ slug, personaCard: result.card });
  });

  // Auto-generate the Persona Card from the creator's imported content (F1.x).
  router.post('/:slug/persona/generate', ...studioGate, async (c) => {
    if (!deps.getLLM) return c.json({ error: 'persona_gen_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const slug = c.req.param('slug');
    const [creator] = await getDb()
      .select({ displayName: creators.displayName, niche: creators.niche })
      .from(creators)
      .where(eq(creators.id, owned))
      .limit(1);
    if (!creator) return c.json({ error: 'creator_not_found', slug }, 404);

    try {
      const card = await generatePersonaCard(getDb(), deps.getLLM(), {
        creatorId: owned,
        slug,
        displayName: creator.displayName,
        niche: creator.niche,
        model: deps.personaModel ?? 'claude-haiku-4-5',
      });
      return c.json({ slug, personaCard: card });
    } catch (err) {
      if (err instanceof PersonaGenError) {
        return c.json({ error: 'persona_gen_failed', message: err.message }, 422);
      }
      throw err;
    }
  });

  return router;
}

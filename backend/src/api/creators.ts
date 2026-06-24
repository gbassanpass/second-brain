import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { contentSources, creators } from '../db/schema.js';
import { documentKindSchema } from '../db/types.js';
import type { Embedder } from '../embeddings/base.js';
import type { LLMClient } from '../llm/base.js';
import { personaCardSchema } from '../rag/persona.js';
import {
  createAccessCode,
  listAccessCodes,
  listAudience,
  setAccessCodeActive,
} from '../services/access-codes.js';
import { getCreatorAnalytics } from '../services/analytics.js';
import {
  generateContentIdeas,
  generateIdeaScript,
  listContentIdeas,
} from '../services/content-ideas.js';
import { getConversationMessages, listConversations } from '../services/conversations.js';
import {
  createCreator,
  getDocumentDetail,
  getPublicCreator,
  listDocuments,
  listSources,
  resolveOwnedCreator,
} from '../services/creator.js';
import { upsertDocument } from '../services/documents.js';
import { buildGraphForCreator, getKnowledgeGraph } from '../services/kg-build.js';
import { addKnowledge } from '../services/knowledge.js';
import { LENIENCY_LEVELS, getLeniency, isLeniency, setLeniency } from '../services/leniency.js';
import { getMindGraph } from '../services/mind-graph.js';
import { getMindScore } from '../services/mind-score.js';
import { PersonaGenError, generatePersonaCard } from '../services/persona-gen.js';
import { getPersonaCard, setPersonaCard } from '../services/persona.js';
import { ensureInstagramSource } from '../services/source-ingest.js';
import { saveTrainingCorrection } from '../services/training.js';
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
  /** Embedder for indexing training corrections (F1.12). */
  getEmbedder?: () => Embedder;
}

const trainBody = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
  rating: z.enum(['nada', 'pouco', 'meio', 'quase', 'exato']).optional(),
});

const instagramBody = z.object({
  handle: z.string().min(1).max(120),
});

// Access codes (F1.17): the creator hands these out to let people talk to the
// clone without paying (pilots, beta, gifted access).
const createAccessCodeBody = z.object({
  label: z.string().min(1).max(120).optional(),
  maxRedemptions: z.coerce.number().int().positive().max(100000).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

const updateAccessCodeBody = z.object({ active: z.boolean() });

// Leniency (F1.5.4): how far the clone may extrapolate.
const leniencyBody = z.object({
  leniency: z.enum(LENIENCY_LEVELS as unknown as [string, ...string[]]),
});

// Add Knowledge (F1.9): manually feed the clone a piece of knowledge. For the
// MVP we support the two types that work end-to-end without extra
// fetching/parsing — free text and Q&A. Both are indexed immediately.
const knowledgeBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('note'),
    text: z.string().min(1).max(20000),
    title: z.string().min(1).max(120).optional(),
  }),
  z.object({
    type: z.literal('qa'),
    question: z.string().min(1).max(2000),
    answer: z.string().min(1).max(8000),
  }),
]);

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

  // Full content of one document (F1.9 detail view) — owner-only.
  router.get('/:slug/documents/:id', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const detail = await getDocumentDetail(getDb(), owned, c.req.param('id'));
    if (!detail) return c.json({ error: 'document_not_found' }, 404);
    return c.json(detail);
  });

  // Studio analytics (E6.5): conversations, cost, top questions, guardrail rate.
  router.get('/:slug/analytics', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const creatorId = owned;
    return c.json(await getCreatorAnalytics(getDb(), creatorId));
  });

  // Content ideas (best-in-class Insights) — owner-only. GET lists persisted
  // ideas; POST generates fresh ones from demand+gaps; POST :id/script writes
  // the full roteiro on demand.
  router.get('/:slug/content-ideas', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json({ ideas: await listContentIdeas(getDb(), owned) });
  });

  router.post('/:slug/content-ideas', ...studioGate, async (c) => {
    if (!deps.getLLM) return c.json({ error: 'ideas_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const ideas = await generateContentIdeas(getDb(), deps.getLLM(), {
      creatorId: owned,
      model: deps.personaModel ?? 'claude-haiku-4-5',
    });
    return c.json({ ideas });
  });

  router.post('/:slug/content-ideas/:id/script', ...studioGate, async (c) => {
    if (!deps.getLLM) return c.json({ error: 'ideas_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const body = (await c.req.json().catch(() => null)) as { force?: unknown } | null;
    const idea = await generateIdeaScript(getDb(), deps.getLLM(), {
      creatorId: owned,
      ideaId: c.req.param('id'),
      model: deps.personaModel ?? 'claude-haiku-4-5',
      force: body?.force === true,
    });
    if (!idea) return c.json({ error: 'idea_not_found' }, 404);
    return c.json({ idea });
  });

  // Conversas que a audiência teve com o clone (F1.13).
  router.get('/:slug/conversations', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json({ conversations: await listConversations(getDb(), owned) });
  });

  router.get('/:slug/conversations/:id', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const msgs = await getConversationMessages(getDb(), owned, c.req.param('id'));
    return c.json({ messages: msgs });
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

  // Resync an existing source (e.g. pull new Instagram posts) — owner-scoped.
  router.post('/:slug/sources/:id/resync', ...studioGate, async (c) => {
    if (!deps.enqueueSync) return c.json({ error: 'ingest_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const db = getDb();
    const [source] = await db
      .select({ id: contentSources.id })
      .from(contentSources)
      .where(and(eq(contentSources.id, c.req.param('id')), eq(contentSources.creatorId, owned)))
      .limit(1);
    if (!source) return c.json({ error: 'source_not_found' }, 404);
    await db
      .update(contentSources)
      .set({ status: 'pending' })
      .where(eq(contentSources.id, source.id));
    const { jobId } = await deps.enqueueSync(source.id);
    return c.json({ sourceId: source.id, status: 'pending', jobId }, 202);
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

  // Train (F1.12): the owner teaches the clone the "right" answer to a question.
  // The correction is persisted as a high-signal Q&A document and indexed, so
  // retrieval surfaces it next time a similar question comes — real training in
  // a RAG system (no fine-tuning).
  router.post('/:slug/train', ...studioGate, async (c) => {
    if (!deps.getEmbedder) return c.json({ error: 'train_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const json = await c.req.json().catch(() => null);
    const parsed = trainBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const [creator] = await getDb()
      .select({ displayName: creators.displayName })
      .from(creators)
      .where(eq(creators.id, owned))
      .limit(1);
    if (!creator) return c.json({ error: 'creator_not_found' }, 404);

    const result = await saveTrainingCorrection(getDb(), deps.getEmbedder(), {
      creatorId: owned,
      creatorName: creator.displayName,
      question: parsed.data.question,
      answer: parsed.data.answer,
    });
    return c.json({ learned: true, ...result });
  });

  // Add Knowledge (F1.9): owner-only. Add free text or a Q&A to the base and
  // index it immediately so retrieval can use it on the next question.
  router.post('/:slug/knowledge', ...studioGate, async (c) => {
    if (!deps.getEmbedder) return c.json({ error: 'knowledge_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const json = await c.req.json().catch(() => null);
    const parsed = knowledgeBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    if (parsed.data.type === 'qa') {
      const [creator] = await getDb()
        .select({ displayName: creators.displayName })
        .from(creators)
        .where(eq(creators.id, owned))
        .limit(1);
      if (!creator) return c.json({ error: 'creator_not_found' }, 404);
      const result = await addKnowledge(getDb(), deps.getEmbedder(), {
        type: 'qa',
        creatorId: owned,
        creatorName: creator.displayName,
        question: parsed.data.question,
        answer: parsed.data.answer,
      });
      return c.json({ added: true, ...result });
    }

    const result = await addKnowledge(getDb(), deps.getEmbedder(), {
      type: 'note',
      creatorId: owned,
      text: parsed.data.text,
      title: parsed.data.title,
    });
    return c.json({ added: true, ...result });
  });

  // Leniency (F1.5.4) — owner-only read/update of how far the clone extrapolates.
  router.get('/:slug/leniency', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json({ leniency: await getLeniency(getDb(), owned) });
  });

  router.put('/:slug/leniency', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const json = await c.req.json().catch(() => null);
    const parsed = leniencyBody.safeParse(json);
    if (!parsed.success || !isLeniency(parsed.data.leniency)) {
      return c.json({ error: 'invalid_body' }, 400);
    }
    await setLeniency(getDb(), owned, parsed.data.leniency);
    return c.json({ leniency: parsed.data.leniency });
  });

  // Mind Score (F1.14) — owner-only coverage/maturity metric.
  router.get('/:slug/mind-score', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json(await getMindScore(getDb(), owned));
  });

  // Mind graph (F1.18) — owner-only; nodes/links for the 3D visualization.
  router.get('/:slug/graph', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json(await getMindGraph(getDb(), owned));
  });

  // Knowledge graph (F1.5.1) — read the extracted entities/relations.
  router.get('/:slug/kg', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json(await getKnowledgeGraph(getDb(), owned));
  });

  // Build/extend the knowledge graph by running LLM extraction over the
  // creator's chunks (F1.5.1). Owner-only; runs inline (capped) and idempotent.
  router.post('/:slug/kg/build', ...studioGate, async (c) => {
    if (!deps.getLLM) return c.json({ error: 'kg_not_configured' }, 503);
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const [creator] = await getDb()
      .select({ displayName: creators.displayName })
      .from(creators)
      .where(eq(creators.id, owned))
      .limit(1);
    if (!creator) return c.json({ error: 'creator_not_found' }, 404);
    const result = await buildGraphForCreator(getDb(), deps.getLLM(), {
      creatorId: owned,
      creatorName: creator.displayName,
      model: deps.personaModel ?? 'claude-haiku-4-5',
    });
    return c.json(result);
  });

  // Access codes (F1.17) — owner-only CRUD. The redeem endpoint lives on the
  // access router (`/api/c/:slug/redeem`) since it must run BEFORE the paywall.
  router.get('/:slug/access-codes', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json({ codes: await listAccessCodes(getDb(), owned) });
  });

  // Who entered the audience via a code + their chat activity (F1.17/F1.15).
  router.get('/:slug/audience', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    return c.json({ members: await listAudience(getDb(), owned) });
  });

  router.post('/:slug/access-codes', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const json = await c.req.json().catch(() => null);
    const parsed = createAccessCodeBody.safeParse(json ?? {});
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const code = await createAccessCode(getDb(), {
      creatorId: owned,
      label: parsed.data.label,
      maxRedemptions: parsed.data.maxRedemptions,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });
    return c.json({ code }, 201);
  });

  router.patch('/:slug/access-codes/:id', ...studioGate, async (c) => {
    const owned = await ownedCreatorId(c);
    if (typeof owned !== 'string') return owned;
    const json = await c.req.json().catch(() => null);
    const parsed = updateAccessCodeBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const updated = await setAccessCodeActive(
      getDb(),
      owned,
      c.req.param('id'),
      parsed.data.active,
    );
    if (!updated) return c.json({ error: 'access_code_not_found' }, 404);
    return c.json({ code: updated });
  });

  return router;
}

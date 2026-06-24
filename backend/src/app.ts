import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createAccessRouter } from './api/access.js';
import { createBillingRouter } from './api/billing.js';
import { type ChatRouterDeps, createChatRouter } from './api/chat.js';
import { createCreatorsRouter } from './api/creators.js';
import { health } from './api/health.js';
import { createMeRouter } from './api/me.js';
import { type EnqueueSyncFn, createSourcesRouter } from './api/sources.js';
import type { BillingProvider } from './billing/base.js';
import { createBillingProvider } from './billing/factory.js';
import { getConfig } from './config.js';
import type { Database } from './db/client.js';
import { getDb as getDbReal } from './db/client.js';
import { createEmbedder } from './embeddings/factory.js';
import { createLLMClient } from './llm/factory.js';
import { createReranker } from './rerank/factory.js';
import type { ChatServices } from './services/chat.js';
import { enqueueIngestSync } from './workers/queue.js';

const defaultEnqueueSync: EnqueueSyncFn = (sourceId) => enqueueIngestSync(sourceId);

const defaultGetBillingProvider: () => BillingProvider = () => createBillingProvider(getConfig());

const defaultGetChatServices: () => ChatServices = () => {
  const config = getConfig();
  return {
    embedder: createEmbedder(config),
    reranker: createReranker(config),
    llm: createLLMClient(config),
  };
};

const defaultGetChatConfig: ChatRouterDeps['getConfig'] = () => {
  const c = getConfig();
  return {
    LLM_DEFAULT_MODEL: c.LLM_DEFAULT_MODEL,
    LLM_FALLBACK_MODEL: c.LLM_FALLBACK_MODEL,
    MAX_TOKENS_PER_REPLY: c.MAX_TOKENS_PER_REPLY,
    RETRIEVAL_TOP_K: c.RETRIEVAL_TOP_K,
    RERANK_SCORE_THRESHOLD: c.RERANK_SCORE_THRESHOLD,
    LLM_ROUTING_FORCE: c.LLM_ROUTING_FORCE,
    LLM_ROUTING_LONG_QUERY_CHARS: c.LLM_ROUTING_LONG_QUERY_CHARS,
    LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD: c.LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD,
  };
};

export interface AppDeps {
  /** Lazy DB accessor — called only when a route needs the database. Default: `getDb()` from db/client.js. */
  getDb?: () => Database;
  /** Lazy BullMQ enqueue — called only by `POST /api/sources/:id/sync`. */
  enqueueSync?: EnqueueSyncFn;
  /** Lazy chat services (embedder/reranker/llm) — called only by `POST /api/chat`. */
  getChatServices?: () => ChatServices;
  /** Lazy chat-related config — called only by `POST /api/chat`. */
  getChatConfig?: ChatRouterDeps['getConfig'];
  /** Override the JWT secret used by `requireAuth`. Defaults to `getConfig().SUPABASE_JWT_SECRET`. */
  jwtSecret?: string;
  /** Override the JWKS URL for asymmetric tokens. Defaults to `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
  jwksUrl?: string;
  /** Lazy billing provider — called only by `POST /api/billing/webhook`. */
  getBillingProvider?: () => BillingProvider;
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono();
  const getDb = deps.getDb ?? getDbReal;
  const jwtSecret = deps.jwtSecret ?? getConfig().SUPABASE_JWT_SECRET;
  // Current Supabase signs access tokens with ES256 (asymmetric); the verifier
  // fetches the public key from the project's JWKS. HS256 (tests/legacy) still
  // works via the shared secret.
  const jwksUrl =
    deps.jwksUrl ?? `${getConfig().SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  const authDeps = { getDb, jwtSecret, jwksUrl };

  app.use('*', logger());

  app.route('/api/health', health);
  app.route(
    '/api/creators',
    createCreatorsRouter({
      ...authDeps,
      enqueueSync: deps.enqueueSync ?? defaultEnqueueSync,
      getLLM: () => createLLMClient(getConfig()),
      personaModel: getConfig().LLM_DEFAULT_MODEL,
      getEmbedder: () => createEmbedder(getConfig()),
    }),
  );
  app.route('/api/sources', createSourcesRouter(getDb, deps.enqueueSync ?? defaultEnqueueSync));
  app.route('/api/me', createMeRouter(authDeps));
  app.route('/api/c', createAccessRouter(authDeps));
  app.route(
    '/api/billing',
    createBillingRouter({
      ...authDeps,
      getProvider: deps.getBillingProvider ?? defaultGetBillingProvider,
      priceId: getConfig().STRIPE_PRICE_ID,
      publicAppUrl: getConfig().PUBLIC_APP_URL,
    }),
  );
  app.route(
    '/api/chat',
    createChatRouter({
      ...authDeps,
      getServices: deps.getChatServices ?? defaultGetChatServices,
      getConfig: deps.getChatConfig ?? defaultGetChatConfig,
    }),
  );

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

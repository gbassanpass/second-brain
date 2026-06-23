import { Hono } from 'hono';
import { type AccessVariables, requireAccess } from './middleware/require-access.js';
import { type RequireAuthDeps, requireAuth } from './middleware/require-auth.js';

export interface AccessRouterDeps extends RequireAuthDeps {
  /** Clock override forwarded to `requireAccess` — used by tests. */
  now?: () => number;
}

/**
 * `GET /api/c/:slug/access` — pre-flight paywall check.
 * Frontends call this before opening the chat UI so they can show the
 * checkout CTA without having to send a chat turn that would 402 anyway.
 * Returns the same `ResolvedAccess` shape that `requireAccess` writes to ctx.
 */
export function createAccessRouter(deps: AccessRouterDeps): Hono<{ Variables: AccessVariables }> {
  const router = new Hono<{ Variables: AccessVariables }>();
  router.use('/:slug/*', requireAuth(deps));
  router.use(
    '/:slug/*',
    requireAccess({
      getDb: deps.getDb,
      now: deps.now,
    }),
  );
  router.get('/:slug/access', (c) => {
    const access = c.get('access');
    return c.json({
      allowed: true,
      creatorId: access.creatorId,
      creatorSlug: access.creatorSlug,
      reason: access.reason,
      subscriptionId: access.subscriptionId ?? null,
    });
  });
  return router;
}

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { creators } from '../db/schema.js';
import { redeemAccessCode } from '../services/access-codes.js';
import { type AccessVariables, requireAccess } from './middleware/require-access.js';
import { type RequireAuthDeps, requireAuth } from './middleware/require-auth.js';

export interface AccessRouterDeps extends RequireAuthDeps {
  /** Clock override forwarded to `requireAccess` / redeem — used by tests. */
  now?: () => number;
}

const redeemBody = z.object({ code: z.string().min(1).max(64) });

/**
 * `/api/c/:slug/*` — audience-facing access endpoints.
 *   - `GET  /:slug/access`  pre-flight paywall check (behind `requireAccess`).
 *   - `POST /:slug/redeem`  redeem an access code (F1.17). Auth-only: it must
 *      run BEFORE the paywall, since the whole point is to grant access to
 *      someone who doesn't have it yet.
 */
export function createAccessRouter(deps: AccessRouterDeps): Hono<{ Variables: AccessVariables }> {
  const router = new Hono<{ Variables: AccessVariables }>();
  router.use('/:slug/*', requireAuth(deps));

  router.get('/:slug/access', requireAccess({ getDb: deps.getDb, now: deps.now }), (c) => {
    const access = c.get('access');
    return c.json({
      allowed: true,
      creatorId: access.creatorId,
      creatorSlug: access.creatorSlug,
      reason: access.reason,
      subscriptionId: access.subscriptionId ?? null,
    });
  });

  router.post('/:slug/redeem', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const json = await c.req.json().catch(() => null);
    const parsed = redeemBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    const slug = c.req.param('slug');
    const [creator] = await deps
      .getDb()
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    if (!creator) return c.json({ error: 'creator_not_found', slug }, 404);

    const result = await redeemAccessCode(deps.getDb(), {
      userId: user.id,
      creatorId: creator.id,
      code: parsed.data.code,
      now: deps.now,
    });

    if (!result.ok) {
      // Code problems are a 422 (well-formed request, unusable code) so the
      // frontend can show a friendly message distinct from auth/validation.
      return c.json({ redeemed: false, reason: result.reason }, 422);
    }
    return c.json({ redeemed: true, alreadyGranted: result.alreadyGranted });
  });

  return router;
}

import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { creators } from '../db/schema.js';
import {
  type AuthVariables,
  type RequireAuthDeps,
  requireAuth,
} from './middleware/require-auth.js';

/**
 * `GET /api/me` — the authenticated user (id/role) plus `creatorSlug`: the clone
 * they OWN, if any. The frontend uses `creatorSlug` to send a returning owner
 * straight to their Studio instead of the onboarding flow.
 */
export function createMeRouter(deps: RequireAuthDeps): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();
  router.use('*', requireAuth(deps));
  router.get('/', async (c) => {
    const user = c.get('user');
    const [owned] = await deps
      .getDb()
      .select({ slug: creators.slug })
      .from(creators)
      .where(eq(creators.ownerUserId, user.id))
      .orderBy(desc(creators.createdAt))
      .limit(1);
    return c.json({
      id: user.id,
      externalId: user.externalId,
      email: user.email,
      role: user.role,
      creatorSlug: owned?.slug ?? null,
    });
  });
  return router;
}

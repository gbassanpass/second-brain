import { Hono } from 'hono';
import {
  type AuthVariables,
  type RequireAuthDeps,
  requireAuth,
} from './middleware/require-auth.js';

/**
 * `GET /api/me` — returns the authenticated user as resolved by the
 * `requireAuth` middleware. Mostly an acceptance-criteria demo for E5.1
 * (showing that 401s fire correctly), but also the natural read-side for
 * future client code that needs the domain `id` + `role`.
 */
export function createMeRouter(deps: RequireAuthDeps): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();
  router.use('*', requireAuth(deps));
  router.get('/', (c) => {
    const user = c.get('user');
    return c.json({
      id: user.id,
      externalId: user.externalId,
      email: user.email,
      role: user.role,
    });
  });
  return router;
}

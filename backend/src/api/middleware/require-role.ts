import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from './require-auth.js';

/**
 * Restricts a route to the given domain roles (`public.users.role`).
 * Mount AFTER `requireAuth` — it reads `c.get('user')`. Returns 403 for an
 * authenticated user whose role isn't allowed, 401 if auth hasn't run.
 *
 * MVP note: any creator/operator can manage any creator (there's no
 * user↔creator ownership table yet — that's F2.1). This gate only separates
 * subscribers from creators/operators.
 */
export function requireRole(...roles: string[]): MiddlewareHandler<{ Variables: AuthVariables }> {
  const allowed = new Set(roles);
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'unauthorized', reason: 'requireAuth_not_run' }, 401);
    }
    if (!allowed.has(user.role)) {
      return c.json({ error: 'forbidden', reason: 'insufficient_role', role: user.role }, 403);
    }
    await next();
  };
}

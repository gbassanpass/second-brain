import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { JwtError, verifySupabaseToken } from '../../auth/jwt.js';
import type { Database } from '../../db/client.js';
import { users } from '../../db/schema.js';

/**
 * What `requireAuth` writes into the Hono context after a successful turn.
 * Domain `role` comes from `public.users.role`, NOT the GoTrue JWT role —
 * the JWT only has 'authenticated' for any signed-in user. Handlers reach
 * the user via `c.get('user')`.
 */
export interface AuthenticatedUser {
  id: string;
  externalId: string;
  email: string | null;
  role: string;
}

/**
 * Hono variable bag — typed so `c.get('user')` returns `AuthenticatedUser`
 * inside any handler running after `requireAuth`.
 */
export interface AuthVariables {
  user: AuthenticatedUser;
}

export interface RequireAuthDeps {
  /** Lazy DB accessor — only invoked per protected request. */
  getDb: () => Database;
  /** HS256 secret (legacy/local) GoTrue may sign tokens with. */
  jwtSecret: string;
  /**
   * JWKS endpoint for asymmetric tokens (the default for current Supabase —
   * ES256). e.g. `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
   */
  jwksUrl?: string;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Verifies the `Authorization: Bearer <token>` header and resolves the
 * matching `public.users` row by `external_id = jwt.sub`. Rejects with 401
 * on every failure mode (missing header, malformed JWT, bad signature,
 * expired, sub not yet replicated to `public.users`) so the route stays
 * agnostic to auth wire-format.
 *
 * Acceptance per docs/07 §E5.1:
 *   - chamadas sem JWT → 401
 *   - JWT inválido     → 401
 *   - signup pelo frontend → `public.users` recebe row (via DB trigger;
 *     middleware aqui só consome o que o trigger gravou).
 */
export function requireAuth(deps: RequireAuthDeps): MiddlewareHandler {
  return async (c: Context, next) => {
    const header = c.req.header('authorization') ?? c.req.header('Authorization');
    if (!header) return unauthorized(c, 'missing_authorization_header');

    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return unauthorized(c, 'malformed_authorization_header');
    const token = match[1] as string;

    let sub: string;
    try {
      const payload = await verifySupabaseToken(token, {
        secret: deps.jwtSecret,
        jwksUrl: deps.jwksUrl,
        now: deps.now,
      });
      sub = payload.sub;
    } catch (err) {
      if (err instanceof JwtError) {
        return unauthorized(c, `jwt_${err.code}`);
      }
      throw err;
    }

    const [row] = await deps
      .getDb()
      .select({
        id: users.id,
        externalId: users.externalId,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.externalId, sub))
      .limit(1);
    if (!row || !row.externalId) {
      // The trigger should have populated this on signup. Treat as 401 —
      // we never want a JWT we can't tie back to a domain user.
      return unauthorized(c, 'user_not_provisioned');
    }

    c.set('user', {
      id: row.id,
      externalId: row.externalId,
      email: row.email,
      role: row.role,
    } satisfies AuthenticatedUser);
    await next();
  };
}

function unauthorized(c: Context, reason: string) {
  return c.json({ error: 'unauthorized', reason }, 401);
}

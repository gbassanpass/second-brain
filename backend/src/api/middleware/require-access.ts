import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { Database } from '../../db/client.js';
import { creators } from '../../db/schema.js';
import { type AccessDecision, type AccessReason, checkAccess } from '../../services/access.js';
import type { AuthVariables } from './require-auth.js';

/**
 * What `requireAccess` writes into the context after a green decision.
 * Handlers downstream can branch on `reason` (e.g. log "served free" for
 * creator/operator turns).
 */
export interface ResolvedAccess {
  creatorId: string;
  creatorSlug: string;
  reason: AccessReason;
  subscriptionId?: string;
}

export interface AccessVariables extends AuthVariables {
  access: ResolvedAccess;
}

export interface RequireAccessDeps {
  getDb: () => Database;
  /**
   * Resolves the creator slug for the current request. Defaults to
   * `c.req.param('slug')` so it works out-of-the-box on routes mounted under
   * `/api/c/:slug/...`. Override for routes that carry the slug elsewhere
   * (request body, header, etc.). May be async — e.g. reading `c.req.json()`
   * (Hono caches the parsed body, so the handler can read it again).
   */
  resolveSlug?: (c: Context) => string | undefined | Promise<string | undefined>;
  /** Clock override for tests — forwarded to `checkAccess`. */
  now?: () => number;
}

/**
 * Hono middleware that enforces docs/06 §Regras de acesso:
 *   - 401 if `requireAuth` hasn't run (no user in ctx),
 *   - 404 if the slug doesn't match a creator,
 *   - 402 with a checkout-payload when paywall blocks,
 *   - sets `c.set('access', ResolvedAccess)` and continues otherwise.
 *
 * Mount AFTER `requireAuth` — this middleware reads `c.get('user')`.
 */
export function requireAccess(deps: RequireAccessDeps): MiddlewareHandler {
  const resolveSlug = deps.resolveSlug ?? ((c) => c.req.param('slug'));
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'unauthorized', reason: 'requireAuth_not_run' }, 401);
    }
    const slug = await resolveSlug(c);
    if (!slug) {
      return c.json({ error: 'bad_request', reason: 'creator_slug_missing' }, 400);
    }

    const db = deps.getDb();
    const [creator] = await db
      .select({ id: creators.id, slug: creators.slug })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug }, 404);
    }

    const decision = await checkAccess(db, {
      userId: user.id,
      userRole: user.role,
      creatorId: creator.id,
      now: deps.now,
    });

    if (!decision.allowed) {
      return paymentRequired(c, creator, decision);
    }

    c.set('access', {
      creatorId: creator.id,
      creatorSlug: creator.slug,
      reason: decision.reason,
      subscriptionId: decision.subscriptionId,
    } satisfies ResolvedAccess);
    await next();
  };
}

/**
 * 402 payload. `checkout.url` is null until E5.3 hooks Stripe/Hotmart in —
 * frontends should treat null as "no provider yet, show plans page".
 */
function paymentRequired(
  c: Context,
  creator: { id: string; slug: string },
  decision: AccessDecision,
) {
  return c.json(
    {
      error: 'payment_required',
      reason: decision.reason,
      creatorId: creator.id,
      creatorSlug: creator.slug,
      checkout: {
        url: null,
        message: `Assine ${creator.slug} para continuar.`,
      },
    },
    402,
  );
}

import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { subscriptions } from '../db/schema.js';

/**
 * Statuses that count as "actively paying" for paywall purposes.
 *   - `active`:   recurring billing healthy (Stripe default).
 *   - `trialing`: in free trial — still counts as access.
 * Anything else (`canceled`, `past_due`, `unpaid`, `incomplete`, ...) blocks.
 */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export type AccessReason =
  | 'operator_role'
  | 'creator_role'
  | 'active_subscription'
  | 'no_subscription'
  | 'expired_subscription';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
  /** Present when the decision came from a subscription row. */
  subscriptionId?: string;
}

export interface CheckAccessInput {
  userId: string;
  /** Domain role from `public.users.role`. */
  userRole: string;
  creatorId: string;
  /** Wall-clock at decision time. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Pure access check per docs/06 §Regras de acesso:
 *   1. operator / creator bypass the paywall (any creator in the MVP — once
 *      we go multi-tenant in F2.1 we'll tie users to specific creators).
 *   2. otherwise must have a `subscriptions` row with status in
 *      ACTIVE_STATUSES AND `current_period_end` either NULL or in the future.
 *
 * No HTTP, no Hono — the middleware in `api/middleware/require-access.ts`
 * adapts this to a 200 / 402 reply.
 */
export async function checkAccess(db: Database, input: CheckAccessInput): Promise<AccessDecision> {
  if (input.userRole === 'operator') {
    return { allowed: true, reason: 'operator_role' };
  }
  if (input.userRole === 'creator') {
    return { allowed: true, reason: 'creator_role' };
  }

  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, input.userId), eq(subscriptions.creatorId, input.creatorId)),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!sub) {
    return { allowed: false, reason: 'no_subscription' };
  }

  const nowMs = (input.now ?? Date.now)();
  const statusOk = ACTIVE_STATUSES.has(sub.status);
  const periodOk = sub.currentPeriodEnd === null || sub.currentPeriodEnd.getTime() > nowMs;

  if (statusOk && periodOk) {
    return { allowed: true, reason: 'active_subscription', subscriptionId: sub.id };
  }
  return {
    allowed: false,
    reason: 'expired_subscription',
    subscriptionId: sub.id,
  };
}

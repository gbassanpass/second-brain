import { sql } from 'drizzle-orm';
import type { BillingEvent } from '../billing/base.js';
import type { Database } from '../db/client.js';
import { subscriptions } from '../db/schema.js';

export interface ProcessBillingResult {
  subscriptionId: string;
  /** `inserted` on first sight of the subscription, `updated` on reprocess. */
  action: 'inserted' | 'updated';
}

/**
 * Apply a normalized billing event to `subscriptions` (E5.3).
 *
 * Idempotent by `(provider, external_id)`: the unique index added in migration
 * 0003 turns this into an upsert, so reprocessing the same provider event
 * (Stripe retries, duplicate deliveries) updates the row in place instead of
 * duplicating it. `xmax = 0` on the returned row distinguishes insert vs update
 * (xmax is the deleting/locking txid; 0 means the row was freshly inserted).
 */
export async function processBillingEvent(
  db: Database,
  event: BillingEvent,
): Promise<ProcessBillingResult> {
  const s = event.subscription;
  const [row] = await db
    .insert(subscriptions)
    .values({
      creatorId: s.creatorId,
      userId: s.userId,
      plan: s.plan,
      status: s.status,
      provider: event.provider,
      externalId: s.externalId,
      currentPeriodEnd: s.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: [subscriptions.provider, subscriptions.externalId],
      set: {
        creatorId: s.creatorId,
        userId: s.userId,
        plan: s.plan,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd,
      },
    })
    .returning({ id: subscriptions.id, inserted: sql<boolean>`(xmax = 0)` });

  if (!row) {
    throw new Error('billing upsert returned no row');
  }
  return { subscriptionId: row.id, action: row.inserted ? 'inserted' : 'updated' };
}

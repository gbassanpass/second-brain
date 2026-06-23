import { Hono } from 'hono';
import {
  type BillingEvent,
  BillingPayloadError,
  type BillingProvider,
  BillingSignatureError,
} from '../billing/base.js';
import type { Database } from '../db/client.js';
import { processBillingEvent } from '../services/billing.js';

export interface BillingRouterDeps {
  getDb: () => Database;
  /** Lazy provider accessor — instantiated only when a webhook arrives. */
  getProvider: () => BillingProvider;
}

/**
 * `POST /api/billing/webhook` (docs/06 §Billing).
 *
 * Public route — the provider signature is the authentication, so there's no
 * `requireAuth`. We read the raw body (signature is computed over bytes), let
 * the provider adapter verify + normalize, then upsert the subscription
 * idempotently. Ignored event types ack 200 so the provider stops retrying.
 */
export function createBillingRouter(deps: BillingRouterDeps): Hono {
  const router = new Hono();

  router.post('/webhook', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('stripe-signature');

    let event: BillingEvent | null;
    try {
      event = deps.getProvider().parseEvent(rawBody, signature);
    } catch (err) {
      if (err instanceof BillingSignatureError) {
        return c.json({ error: 'invalid_signature', message: err.message }, 400);
      }
      if (err instanceof BillingPayloadError) {
        return c.json({ error: 'invalid_payload', message: err.message }, 400);
      }
      throw err;
    }

    if (!event) {
      return c.json({ received: true, ignored: true });
    }

    const result = await processBillingEvent(deps.getDb(), event);
    return c.json({
      received: true,
      subscriptionId: result.subscriptionId,
      action: result.action,
    });
  });

  return router;
}

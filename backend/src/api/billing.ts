import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  BillingConfigError,
  type BillingEvent,
  BillingPayloadError,
  type BillingProvider,
  BillingSignatureError,
} from '../billing/base.js';
import { creators } from '../db/schema.js';
import { processBillingEvent } from '../services/billing.js';
import {
  type AuthVariables,
  type RequireAuthDeps,
  requireAuth,
} from './middleware/require-auth.js';

export interface BillingRouterDeps extends RequireAuthDeps {
  /** Lazy provider accessor — instantiated only when a request arrives. */
  getProvider: () => BillingProvider;
  /** Default plan id when the body omits it. */
  defaultPlan?: string;
  /** Stripe price id the checkout subscribes to. */
  priceId?: string;
  /** Public frontend base URL — used to build checkout return URLs. */
  publicAppUrl: string;
}

const checkoutBody = z.object({
  creatorSlug: z.string().min(1),
  plan: z.string().min(1).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Billing routes (docs/06 §Billing):
 *   - `POST /webhook`  — public, signature-authed; upserts subscriptions (E5.3).
 *   - `POST /checkout` — auth'd; opens a hosted checkout session (E6.3).
 */
export function createBillingRouter(deps: BillingRouterDeps): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

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

  // Checkout requires a logged-in user (we need their id for the subscription
  // metadata that the webhook reads back on activation).
  router.use('/checkout', requireAuth(deps));
  router.post('/checkout', async (c) => {
    const user = c.get('user');
    const json = await c.req.json().catch(() => null);
    const parsed = checkoutBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    const db = deps.getDb();
    const [creator] = await db
      .select({ id: creators.id, slug: creators.slug })
      .from(creators)
      .where(eq(creators.slug, parsed.data.creatorSlug))
      .limit(1);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug: parsed.data.creatorSlug }, 404);
    }

    const plan = parsed.data.plan ?? deps.defaultPlan ?? 'mvp-monthly';
    const successUrl =
      parsed.data.successUrl ?? `${deps.publicAppUrl}/c/${creator.slug}/chat?checkout=success`;
    const cancelUrl =
      parsed.data.cancelUrl ?? `${deps.publicAppUrl}/c/${creator.slug}/chat?checkout=cancel`;

    try {
      const session = await deps.getProvider().createCheckoutSession({
        userId: user.id,
        creatorId: creator.id,
        creatorSlug: creator.slug,
        plan,
        priceId: deps.priceId,
        successUrl,
        cancelUrl,
        customerEmail: user.email ?? undefined,
      });
      return c.json({ url: session.url, externalId: session.externalId });
    } catch (err) {
      if (err instanceof BillingConfigError) {
        return c.json({ error: 'billing_not_configured', message: err.message }, 503);
      }
      throw err;
    }
  });

  return router;
}

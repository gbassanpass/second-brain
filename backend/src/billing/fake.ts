import type { BillingEvent, BillingProvider, CheckoutInput, CheckoutSession } from './base.js';
import { parseStripeEventPayload } from './stripe.js';

/**
 * Fake billing provider for tests and local dev (BILLING_PROVIDER=fake).
 *
 * Accepts the same Stripe-shaped event JSON as the real adapter but skips
 * signature verification, so tests can post a body without computing an HMAC.
 * Payload validation (Zod) still runs — the parse path is exercised for real.
 * `createCheckoutSession` returns a deterministic local URL so the paywall
 * button works end-to-end without Stripe keys.
 */
export class FakeBilling implements BillingProvider {
  readonly name = 'fake';

  parseEvent(rawBody: string, _signature: string | undefined): BillingEvent | null {
    return parseStripeEventPayload(rawBody);
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    // Send the browser straight back to successUrl — simulates a completed
    // checkout locally. The subscription itself is created by posting a fake
    // webhook (see scripts/dev or tests), keeping the activation path honest.
    const externalId = `cs_fake_${input.creatorSlug}_${input.userId.slice(0, 8)}`;
    return { url: input.successUrl, externalId };
  }
}

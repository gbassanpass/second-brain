import type { BillingEvent, BillingProvider } from './base.js';
import { parseStripeEventPayload } from './stripe.js';

/**
 * Fake billing provider for tests (BILLING_PROVIDER=fake).
 *
 * Accepts the same Stripe-shaped event JSON as the real adapter but skips
 * signature verification, so tests can post a body without computing an HMAC.
 * Payload validation (Zod) still runs — the parse path is exercised for real.
 */
export class FakeBilling implements BillingProvider {
  readonly name = 'fake';

  parseEvent(rawBody: string, _signature: string | undefined): BillingEvent | null {
    return parseStripeEventPayload(rawBody);
  }
}

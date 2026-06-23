/**
 * Billing provider abstraction (E5.3).
 *
 * The webhook handler (`api/billing.ts`) speaks only to this interface — never
 * to a provider SDK directly (CLAUDE.md §Convenções). Stripe is the MVP
 * implementation; Hotmart/Kiwify slot in behind the same `parseEvent` later by
 * mapping their payloads to the same `BillingEvent`.
 */

/** A subscription state normalized away from any provider's schema. */
export interface NormalizedSubscription {
  /** Provider subscription id (e.g. Stripe `sub_...`). Idempotency key. */
  externalId: string;
  /**
   * Provider status, passed through verbatim — our access check
   * (`services/access.ts`) already speaks Stripe's vocabulary
   * (`active`/`trialing`/`canceled`/...).
   */
  status: string;
  /** Plan identifier (from checkout metadata or the price id). */
  plan: string;
  /** Our `public.users.id` — carried in the provider's subscription metadata. */
  userId: string;
  /** Our `creators.id` — carried in the provider's subscription metadata. */
  creatorId: string;
  /** End of the paid period; null = no expiry tracked. */
  currentPeriodEnd: Date | null;
}

export interface BillingEvent {
  /** Provider event id (e.g. Stripe `evt_...`) — for logging/tracing. */
  eventId: string;
  /** Provider name persisted to `subscriptions.provider`. */
  provider: string;
  subscription: NormalizedSubscription;
}

/** Raised when the webhook signature can't be verified. → HTTP 400. */
export class BillingSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingSignatureError';
  }
}

/** Raised when the payload is malformed or missing required fields. → HTTP 400. */
export class BillingPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingPayloadError';
  }
}

export interface BillingProvider {
  /** Persisted to `subscriptions.provider`. */
  readonly name: string;
  /**
   * Verify the signature and parse the raw webhook body into a normalized
   * event. Returns `null` for event types we don't act on (the route acks
   * those with 200 so the provider stops retrying). Throws
   * `BillingSignatureError` on a bad signature and `BillingPayloadError` on a
   * malformed/unsupported payload.
   */
  parseEvent(rawBody: string, signature: string | undefined): BillingEvent | null;
}

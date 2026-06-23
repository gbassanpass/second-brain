import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  BillingConfigError,
  type BillingEvent,
  BillingPayloadError,
  type BillingProvider,
  BillingSignatureError,
  type CheckoutInput,
  type CheckoutSession,
} from './base.js';

/**
 * Stripe webhook adapter (E5.3).
 *
 * Signature verification reimplements Stripe's `constructEvent` scheme with
 * `node:crypto` (same zero-dep approach as the JWT verifier in `auth/jwt.ts`):
 *   - the `Stripe-Signature` header is `t=<unix>,v1=<hex hmac>[,v1=...]`,
 *   - the signed payload is `${t}.${rawBody}`,
 *   - the HMAC-SHA256 of that under the endpoint secret must match a `v1`,
 *   - and `t` must be within `toleranceSeconds` of now (replay guard).
 *
 * We only act on `customer.subscription.*` events; everything else parses to
 * `null` and the route acks it.
 */

const PROVIDER = 'stripe';

const StripeSubscriptionObject = z
  .object({
    id: z.string().min(1),
    object: z.literal('subscription'),
    status: z.string().min(1),
    current_period_end: z.number().int().nullable().optional(),
    items: z
      .object({
        data: z
          .array(
            z.object({
              price: z.object({ id: z.string() }).partial().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    metadata: z.record(z.string()).optional(),
  })
  .passthrough();

const StripeEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.object({ object: z.record(z.unknown()) }),
  })
  .passthrough();

/**
 * Shared payload parser — verification-free. Used by `StripeBilling` (after it
 * verifies the signature) and by `FakeBilling` (tests skip verification). Lives
 * in the adapter dir so the Zod-validated boundary stays in one place.
 */
export function parseStripeEventPayload(rawBody: string): BillingEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch (err) {
    throw new BillingPayloadError(`body is not valid JSON: ${(err as Error).message}`);
  }

  const eventParsed = StripeEventSchema.safeParse(json);
  if (!eventParsed.success) {
    throw new BillingPayloadError(`unexpected event shape: ${eventParsed.error.message}`);
  }
  const event = eventParsed.data;

  // We only act on subscription lifecycle events. created/updated/deleted all
  // carry the full subscription object with a current `status`.
  if (!event.type.startsWith('customer.subscription.')) {
    return null;
  }

  const subParsed = StripeSubscriptionObject.safeParse(event.data.object);
  if (!subParsed.success) {
    throw new BillingPayloadError(`unexpected subscription object: ${subParsed.error.message}`);
  }
  const sub = subParsed.data;

  const metadata = sub.metadata ?? {};
  const userId = metadata.user_id;
  const creatorId = metadata.creator_id;
  if (!userId || !creatorId) {
    throw new BillingPayloadError(
      'subscription metadata missing user_id/creator_id — set them at checkout',
    );
  }

  const plan = metadata.plan ?? sub.items?.data?.[0]?.price?.id ?? 'unknown';
  const currentPeriodEnd =
    typeof sub.current_period_end === 'number' && sub.current_period_end > 0
      ? new Date(sub.current_period_end * 1000)
      : null;

  return {
    eventId: event.id,
    provider: PROVIDER,
    subscription: {
      externalId: sub.id,
      status: sub.status,
      plan,
      userId,
      creatorId,
      currentPeriodEnd,
    },
  };
}

const StripeCheckoutSessionResponse = z
  .object({ id: z.string().min(1), url: z.string().url() })
  .passthrough();

export interface StripeBillingOptions {
  webhookSecret: string;
  /** Secret API key (`sk_...`) — needed only for `createCheckoutSession`. */
  secretKey?: string;
  /** Base URL of the Stripe API. Overridable in tests. */
  apiBaseUrl?: string;
  /** Injectable fetch for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Clock for the replay-tolerance check. Defaults to `Date.now`. */
  now?: () => number;
  /** Max age of the signed timestamp, in seconds. 0 disables the check. */
  toleranceSeconds?: number;
}

export class StripeBilling implements BillingProvider {
  readonly name = PROVIDER;
  private readonly secret: string;
  private readonly secretKey: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly tolerance: number;

  constructor(opts: StripeBillingOptions) {
    this.secret = opts.webhookSecret;
    this.secretKey = opts.secretKey ?? '';
    this.apiBaseUrl = opts.apiBaseUrl ?? 'https://api.stripe.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.tolerance = opts.toleranceSeconds ?? 300;
  }

  parseEvent(rawBody: string, signature: string | undefined): BillingEvent | null {
    this.verifySignature(rawBody, signature);
    return parseStripeEventPayload(rawBody);
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    if (!this.secretKey) {
      throw new BillingConfigError('STRIPE_SECRET_KEY is not configured');
    }
    if (!input.priceId) {
      throw new BillingConfigError('STRIPE_PRICE_ID is not configured');
    }

    // Stripe's API is form-encoded. `subscription_data[metadata][...]` lands on
    // the subscription object the webhook later receives (E5.3).
    const form = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'subscription_data[metadata][user_id]': input.userId,
      'subscription_data[metadata][creator_id]': input.creatorId,
      'subscription_data[metadata][plan]': input.plan,
      'metadata[user_id]': input.userId,
      'metadata[creator_id]': input.creatorId,
    });
    if (input.customerEmail) {
      form.set('customer_email', input.customerEmail);
    }

    const res = await this.fetchImpl(`${this.apiBaseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new BillingConfigError(`Stripe checkout failed: ${res.status} ${detail}`.trim());
    }
    const parsed = StripeCheckoutSessionResponse.safeParse(await res.json());
    if (!parsed.success) {
      throw new BillingConfigError(`unexpected Stripe checkout response: ${parsed.error.message}`);
    }
    return { url: parsed.data.url, externalId: parsed.data.id };
  }

  private verifySignature(rawBody: string, header: string | undefined): void {
    if (!this.secret) {
      throw new BillingSignatureError('STRIPE_WEBHOOK_SECRET is not configured');
    }
    if (!header) {
      throw new BillingSignatureError('missing Stripe-Signature header');
    }

    let timestamp: string | undefined;
    const v1s: string[] = [];
    for (const item of header.split(',')) {
      const eq = item.indexOf('=');
      if (eq === -1) continue;
      const key = item.slice(0, eq).trim();
      const value = item.slice(eq + 1).trim();
      if (key === 't') timestamp = value;
      else if (key === 'v1' && value) v1s.push(value);
    }
    if (!timestamp || v1s.length === 0) {
      throw new BillingSignatureError('malformed Stripe-Signature header');
    }

    const expected = createHmac('sha256', this.secret).update(`${timestamp}.${rawBody}`).digest();
    const matches = v1s.some((v) => {
      let got: Buffer;
      try {
        got = Buffer.from(v, 'hex');
      } catch {
        return false;
      }
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
    if (!matches) {
      throw new BillingSignatureError('signature mismatch');
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new BillingSignatureError('invalid signature timestamp');
    }
    if (this.tolerance > 0) {
      const ageSec = Math.abs(Math.floor(this.now() / 1000) - ts);
      if (ageSec > this.tolerance) {
        throw new BillingSignatureError(`signature timestamp outside tolerance (${ageSec}s)`);
      }
    }
  }
}

/**
 * Test-only helper: builds a valid `Stripe-Signature` header for `rawBody`.
 * Mirrors `signJwtForTesting` — prod code never imports it.
 */
export function signStripeWebhookForTesting(
  rawBody: string,
  secret: string,
  timestampSec: number = Math.floor(Date.now() / 1000),
): string {
  const sig = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
  return `t=${timestampSec},v1=${sig}`;
}

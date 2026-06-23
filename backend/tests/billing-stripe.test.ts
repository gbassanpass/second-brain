import { describe, expect, it, vi } from 'vitest';
import {
  BillingConfigError,
  BillingPayloadError,
  BillingSignatureError,
} from '../src/billing/base.js';
import {
  StripeBilling,
  parseStripeEventPayload,
  signStripeWebhookForTesting,
} from '../src/billing/stripe.js';

const SECRET = 'whsec_test_secret';

function subscriptionEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_123',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_abc',
        object: 'subscription',
        status: 'active',
        current_period_end: 1893456000, // 2030-01-01
        items: { data: [{ price: { id: 'price_mvp_monthly' } }] },
        metadata: { user_id: 'user-uuid', creator_id: 'creator-uuid' },
        ...overrides,
      },
    },
  });
}

describe('parseStripeEventPayload', () => {
  it('normalizes a subscription event', () => {
    const event = parseStripeEventPayload(subscriptionEvent());
    expect(event).not.toBeNull();
    expect(event?.eventId).toBe('evt_123');
    expect(event?.provider).toBe('stripe');
    expect(event?.subscription).toMatchObject({
      externalId: 'sub_abc',
      status: 'active',
      userId: 'user-uuid',
      creatorId: 'creator-uuid',
    });
    expect(event?.subscription.currentPeriodEnd?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('prefers metadata.plan over the price id', () => {
    const event = parseStripeEventPayload(
      subscriptionEvent({ metadata: { user_id: 'u', creator_id: 'c', plan: 'mvp-monthly' } }),
    );
    expect(event?.subscription.plan).toBe('mvp-monthly');
  });

  it('falls back to the price id when no plan metadata', () => {
    const event = parseStripeEventPayload(subscriptionEvent());
    expect(event?.subscription.plan).toBe('price_mvp_monthly');
  });

  it('passes through a canceled status (deletion event)', () => {
    const body = JSON.stringify({
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_abc',
          object: 'subscription',
          status: 'canceled',
          metadata: { user_id: 'u', creator_id: 'c' },
        },
      },
    });
    const event = parseStripeEventPayload(body);
    expect(event?.subscription.status).toBe('canceled');
    expect(event?.subscription.currentPeriodEnd).toBeNull();
  });

  it('returns null for unrelated event types', () => {
    const body = JSON.stringify({
      id: 'evt_x',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    expect(parseStripeEventPayload(body)).toBeNull();
  });

  it('throws on subscription event missing user_id/creator_id metadata', () => {
    expect(() => parseStripeEventPayload(subscriptionEvent({ metadata: {} }))).toThrow(
      BillingPayloadError,
    );
  });

  it('throws on malformed JSON', () => {
    expect(() => parseStripeEventPayload('{not json')).toThrow(BillingPayloadError);
  });

  it('throws on an unexpected event shape', () => {
    expect(() => parseStripeEventPayload(JSON.stringify({ foo: 'bar' }))).toThrow(
      BillingPayloadError,
    );
  });
});

describe('StripeBilling signature verification', () => {
  const now = () => Date.parse('2026-06-23T00:00:00Z');
  const ts = Math.floor(now() / 1000);

  it('accepts a correctly signed payload', () => {
    const body = subscriptionEvent();
    const sig = signStripeWebhookForTesting(body, SECRET, ts);
    const billing = new StripeBilling({ webhookSecret: SECRET, now });
    const event = billing.parseEvent(body, sig);
    expect(event?.subscription.externalId).toBe('sub_abc');
  });

  it('rejects a tampered body', () => {
    const sig = signStripeWebhookForTesting(subscriptionEvent(), SECRET, ts);
    const billing = new StripeBilling({ webhookSecret: SECRET, now });
    expect(() => billing.parseEvent(subscriptionEvent({ status: 'canceled' }), sig)).toThrow(
      BillingSignatureError,
    );
  });

  it('rejects a wrong secret', () => {
    const body = subscriptionEvent();
    const sig = signStripeWebhookForTesting(body, 'whsec_other', ts);
    const billing = new StripeBilling({ webhookSecret: SECRET, now });
    expect(() => billing.parseEvent(body, sig)).toThrow(BillingSignatureError);
  });

  it('rejects a missing signature header', () => {
    const billing = new StripeBilling({ webhookSecret: SECRET, now });
    expect(() => billing.parseEvent(subscriptionEvent(), undefined)).toThrow(BillingSignatureError);
  });

  it('rejects a malformed signature header', () => {
    const billing = new StripeBilling({ webhookSecret: SECRET, now });
    expect(() => billing.parseEvent(subscriptionEvent(), 'garbage')).toThrow(BillingSignatureError);
  });

  it('rejects a timestamp outside tolerance (replay)', () => {
    const body = subscriptionEvent();
    const staleTs = ts - 10 * 60; // 10 min ago, default tolerance 300s
    const sig = signStripeWebhookForTesting(body, SECRET, staleTs);
    const billing = new StripeBilling({ webhookSecret: SECRET, now, toleranceSeconds: 300 });
    expect(() => billing.parseEvent(body, sig)).toThrow(BillingSignatureError);
  });

  it('honors toleranceSeconds=0 to disable the replay check', () => {
    const body = subscriptionEvent();
    const staleTs = ts - 10 * 60;
    const sig = signStripeWebhookForTesting(body, SECRET, staleTs);
    const billing = new StripeBilling({ webhookSecret: SECRET, now, toleranceSeconds: 0 });
    expect(billing.parseEvent(body, sig)?.subscription.externalId).toBe('sub_abc');
  });

  it('throws when no webhook secret is configured', () => {
    const billing = new StripeBilling({ webhookSecret: '', now });
    expect(() => billing.parseEvent(subscriptionEvent(), 'whatever')).toThrow(
      BillingSignatureError,
    );
  });
});

describe('StripeBilling.createCheckoutSession', () => {
  const checkoutInput = {
    userId: 'user-uuid-1234',
    creatorId: 'creator-uuid',
    creatorSlug: 'fausto',
    plan: 'mvp-monthly',
    priceId: 'price_123',
    successUrl: 'https://app/ok',
    cancelUrl: 'https://app/no',
    customerEmail: 'a@b.com',
  };

  it('POSTs a form-encoded subscription session and returns the url', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe/x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const billing = new StripeBilling({
      webhookSecret: 'whsec',
      secretKey: 'sk_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await billing.createCheckoutSession(checkoutInput);
    expect(session).toEqual({ url: 'https://checkout.stripe/x', externalId: 'cs_test_1' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1/checkout/sessions');
    const body = String(init.body);
    expect(body).toContain('mode=subscription');
    expect(body).toContain('line_items%5B0%5D%5Bprice%5D=price_123');
    // Metadata must ride on the subscription so the webhook can wire it back.
    expect(body).toContain('subscription_data%5Bmetadata%5D%5Buser_id%5D=user-uuid-1234');
    expect(body).toContain('subscription_data%5Bmetadata%5D%5Bcreator_id%5D=creator-uuid');
  });

  it('throws BillingConfigError without a secret key', async () => {
    const billing = new StripeBilling({ webhookSecret: 'whsec' });
    await expect(billing.createCheckoutSession(checkoutInput)).rejects.toThrow(BillingConfigError);
  });

  it('throws BillingConfigError without a price id', async () => {
    const billing = new StripeBilling({ webhookSecret: 'whsec', secretKey: 'sk_test' });
    await expect(
      billing.createCheckoutSession({ ...checkoutInput, priceId: undefined }),
    ).rejects.toThrow(BillingConfigError);
  });

  it('surfaces a Stripe API error as BillingConfigError', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));
    const billing = new StripeBilling({
      webhookSecret: 'whsec',
      secretKey: 'sk_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(billing.createCheckoutSession(checkoutInput)).rejects.toThrow(BillingConfigError);
  });
});

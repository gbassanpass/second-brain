import type { Config } from '../config.js';
import type { BillingProvider } from './base.js';
import { FakeBilling } from './fake.js';
import { StripeBilling } from './stripe.js';

export function createBillingProvider(config: Config): BillingProvider {
  switch (config.BILLING_PROVIDER) {
    case 'stripe':
      return new StripeBilling({ webhookSecret: config.STRIPE_WEBHOOK_SECRET });
    case 'fake':
      return new FakeBilling();
  }
}

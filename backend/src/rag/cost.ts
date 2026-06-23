import type { LLMUsage } from '../llm/base.js';

// Anthropic pricing per 1M tokens (Jun/2026 — keep in sync with docs/03).
// Cache modifiers per Anthropic docs:
//   - cache_read: 10% of base input rate.
//   - cache_creation: 125% of base input rate (25% surcharge).
const PRICING_PER_MILLION = {
  'claude-haiku': { input: 0.25, output: 1.25 },
  'claude-sonnet': { input: 3.0, output: 15.0 },
  'claude-opus': { input: 5.0, output: 25.0 },
} as const;

type PriceTier = keyof typeof PRICING_PER_MILLION;

function pickTier(model: string): PriceTier {
  if (model.includes('haiku')) return 'claude-haiku';
  if (model.includes('sonnet')) return 'claude-sonnet';
  if (model.includes('opus')) return 'claude-opus';
  // Unknown model — log later in E2.6 routing; default to the cheapest tier
  // so we don't silently under-charge for an unrecognised Sonnet/Opus.
  return 'claude-haiku';
}

/**
 * Estimate the USD cost of one LLM turn from the tokens reported by the
 * adapter. Stored in `messages.cost_usd` (numeric(10,5)).
 */
export function estimateCostUsd(model: string, usage: LLMUsage): number {
  const tier = pickTier(model);
  const price = PRICING_PER_MILLION[tier];

  const inputRegular = usage.inputTokens * price.input;
  const inputCacheRead = (usage.cacheReadInputTokens ?? 0) * price.input * 0.1;
  const inputCacheWrite = (usage.cacheCreationInputTokens ?? 0) * price.input * 1.25;
  const output = usage.outputTokens * price.output;

  return (inputRegular + inputCacheRead + inputCacheWrite + output) / 1_000_000;
}

/** Numeric column in PG can only store up to (10,5) — clamp safely. */
export function toNumericString(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '0';
  return usd.toFixed(5);
}

export type RoutingReason =
  | 'default'
  | 'long_query'
  | 'multi_question'
  | 'low_retrieval_confidence'
  | 'forced_default'
  | 'forced_fallback';

export interface RoutingInput {
  query: string;
  /** Rerank scores of the top-N hits, in any order (we look at the max). */
  rerankScores: number[];
}

export interface RoutingConfig {
  defaultModel: string;
  fallbackModel: string;
  /** Queries longer than this go to the fallback model. Default 280. */
  longQueryChars?: number;
  /**
   * If the best rerank score is below this and we still have hits, route to
   * the fallback (the question is on-topic but loosely supported). Default 0.3.
   */
  lowConfidenceThreshold?: number;
  /** Bypass heuristics entirely. Useful for ops/debug via env. */
  force?: 'default' | 'fallback';
}

export interface RoutingDecision {
  model: string;
  reason: RoutingReason;
  defaultModel: string;
  fallbackModel: string;
  /** Signals exposed so the orchestrator can log the decision context. */
  signals: {
    queryChars: number;
    questionMarks: number;
    topRerankScore: number | null;
  };
}

const DEFAULTS = {
  longQueryChars: 280,
  lowConfidenceThreshold: 0.3,
} as const;

/**
 * Decide between the default (cheap) and fallback (capable) model based on
 * deterministic heuristics from docs/05 §Pipeline de resposta item 4:
 *   - long query (chars > N)
 *   - multi-clause question (> 1 '?')
 *   - low retrieval confidence (best rerank score < threshold)
 * `force` short-circuits both (ops escape hatch).
 */
export function pickModel(input: RoutingInput, cfg: RoutingConfig): RoutingDecision {
  const longChars = cfg.longQueryChars ?? DEFAULTS.longQueryChars;
  const lowConf = cfg.lowConfidenceThreshold ?? DEFAULTS.lowConfidenceThreshold;

  const queryChars = input.query.length;
  const questionMarks = (input.query.match(/\?/g) ?? []).length;
  const topRerankScore = input.rerankScores.length ? Math.max(...input.rerankScores) : null;

  const signals = { queryChars, questionMarks, topRerankScore };
  const base = { defaultModel: cfg.defaultModel, fallbackModel: cfg.fallbackModel, signals };

  if (cfg.force === 'fallback') {
    return { ...base, model: cfg.fallbackModel, reason: 'forced_fallback' };
  }
  if (cfg.force === 'default') {
    return { ...base, model: cfg.defaultModel, reason: 'forced_default' };
  }

  if (questionMarks > 1) {
    return { ...base, model: cfg.fallbackModel, reason: 'multi_question' };
  }
  if (queryChars > longChars) {
    return { ...base, model: cfg.fallbackModel, reason: 'long_query' };
  }
  if (topRerankScore !== null && topRerankScore < lowConf) {
    return {
      ...base,
      model: cfg.fallbackModel,
      reason: 'low_retrieval_confidence',
    };
  }

  return { ...base, model: cfg.defaultModel, reason: 'default' };
}

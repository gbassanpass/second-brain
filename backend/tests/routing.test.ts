import { describe, expect, it } from 'vitest';
import { type RoutingConfig, pickModel } from '../src/rag/routing.js';

const baseCfg: RoutingConfig = {
  defaultModel: 'claude-haiku-4-5',
  fallbackModel: 'claude-sonnet-4-6',
};

describe('pickModel', () => {
  it('defaults to the cheap model for short, single-question, well-scored retrieval', () => {
    const d = pickModel({ query: 'O que ele pensa?', rerankScores: [0.8, 0.6] }, baseCfg);
    expect(d.model).toBe(baseCfg.defaultModel);
    expect(d.reason).toBe('default');
    expect(d.signals.queryChars).toBe('O que ele pensa?'.length);
    expect(d.signals.questionMarks).toBe(1);
    expect(d.signals.topRerankScore).toBeCloseTo(0.8);
  });

  it('routes to fallback on long queries', () => {
    const longQuery = `${'palavra '.repeat(60)}?`; // ~480 chars
    const d = pickModel({ query: longQuery, rerankScores: [0.9] }, baseCfg);
    expect(d.model).toBe(baseCfg.fallbackModel);
    expect(d.reason).toBe('long_query');
  });

  it('routes to fallback when there are multiple questions', () => {
    const d = pickModel(
      { query: 'O que ele pensa sobre A? E sobre B?', rerankScores: [0.8] },
      baseCfg,
    );
    expect(d.model).toBe(baseCfg.fallbackModel);
    expect(d.reason).toBe('multi_question');
  });

  it('routes to fallback when the best rerank score is below the threshold', () => {
    const d = pickModel({ query: 'tema solto', rerankScores: [0.1, 0.05] }, baseCfg);
    expect(d.model).toBe(baseCfg.fallbackModel);
    expect(d.reason).toBe('low_retrieval_confidence');
  });

  it('keeps the default when there are no rerank scores (no_context path handles that elsewhere)', () => {
    const d = pickModel({ query: 'oi', rerankScores: [] }, baseCfg);
    expect(d.model).toBe(baseCfg.defaultModel);
    expect(d.reason).toBe('default');
    expect(d.signals.topRerankScore).toBeNull();
  });

  it('honors force=fallback (ops escape hatch)', () => {
    const d = pickModel({ query: 'oi', rerankScores: [0.99] }, { ...baseCfg, force: 'fallback' });
    expect(d.model).toBe(baseCfg.fallbackModel);
    expect(d.reason).toBe('forced_fallback');
  });

  it('honors force=default even when heuristics would escalate', () => {
    const d = pickModel(
      { query: 'A? B? C?'.repeat(50), rerankScores: [0.0] },
      { ...baseCfg, force: 'default' },
    );
    expect(d.model).toBe(baseCfg.defaultModel);
    expect(d.reason).toBe('forced_default');
  });

  it('respects custom thresholds', () => {
    const tight = pickModel(
      { query: 'pergunta com 30 caracteres ok ok.', rerankScores: [0.5] },
      { ...baseCfg, longQueryChars: 10 },
    );
    expect(tight.reason).toBe('long_query');

    const looseConfidence = pickModel(
      { query: 'oi', rerankScores: [0.15] },
      { ...baseCfg, lowConfidenceThreshold: 0.1 },
    );
    expect(looseConfidence.reason).toBe('default');
  });
});

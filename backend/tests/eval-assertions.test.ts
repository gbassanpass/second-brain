import { describe, expect, it } from 'vitest';
import { type ActualResult, evaluate } from '../../eval/assertions.js';
import { goldenExpectsSchema } from '../../eval/schema.js';

function ok(overrides: Partial<ActualResult> = {}): ActualResult {
  return {
    content: 'Resposta padrão citando [1].',
    guardrailFlag: null,
    fallback: null,
    postFilter: { action: 'pass', category: null, signals: [] },
    ...overrides,
  };
}

describe('evaluate — golden assertions', () => {
  it('passes when no expectations are set', () => {
    const expects = goldenExpectsSchema.parse({});
    const result = evaluate(expects, ok());
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('checks guardrail_flag equality when defined', () => {
    const expects = goldenExpectsSchema.parse({ guardrail_flag: 'investment' });
    expect(evaluate(expects, ok({ guardrailFlag: 'investment' })).passed).toBe(true);
    const bad = evaluate(expects, ok({ guardrailFlag: null }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('guardrail_flag mismatch');
  });

  it('checks fallback equality when defined', () => {
    const expects = goldenExpectsSchema.parse({ fallback: 'no_context' });
    expect(evaluate(expects, ok({ fallback: 'no_context' })).passed).toBe(true);
    const bad = evaluate(expects, ok({ fallback: null }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('fallback mismatch');
  });

  it('checks post_filter_category equality when defined', () => {
    const expects = goldenExpectsSchema.parse({ post_filter_category: 'recommendation' });
    expect(
      evaluate(
        expects,
        ok({ postFilter: { action: 'regenerated', category: 'recommendation', signals: [] } }),
      ).passed,
    ).toBe(true);
    const bad = evaluate(expects, ok());
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('post_filter_category mismatch');
  });

  it('must_contain_any requires at least one substring (case-insensitive)', () => {
    const expects = goldenExpectsSchema.parse({ must_contain_any: ['80%', 'Lula'] });
    expect(evaluate(expects, ok({ content: 'O resultado é 80% lula leva.' })).passed).toBe(true);
    const bad = evaluate(expects, ok({ content: 'Outra coisa qualquer.' }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('must_contain_any');
  });

  it('must_not_contain fails on ANY hit', () => {
    const expects = goldenExpectsSchema.parse({ must_not_contain: ['compre', 'venda'] });
    expect(evaluate(expects, ok({ content: 'Antes de decidir, pondere.' })).passed).toBe(true);
    const bad = evaluate(expects, ok({ content: 'Compre Bitcoin agora!' }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('must_not_contain hit');
  });

  it('requires_citation flags replies with no [N] marker', () => {
    const expects = goldenExpectsSchema.parse({ requires_citation: true });
    expect(evaluate(expects, ok({ content: 'Como [2] mostra, …' })).passed).toBe(true);
    const bad = evaluate(expects, ok({ content: 'Resposta sem marcador.' }));
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain('requires_citation');
  });

  it('accumulates failures across dimensions', () => {
    const expects = goldenExpectsSchema.parse({
      guardrail_flag: 'investment',
      must_contain_any: ['Bitcoin'],
      must_not_contain: ['compre'],
    });
    const result = evaluate(
      expects,
      ok({ guardrailFlag: null, content: 'Compre dólar antes que suba.' }),
    );
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(3);
  });
});

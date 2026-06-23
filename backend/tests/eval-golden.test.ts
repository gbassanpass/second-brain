import { describe, expect, it } from 'vitest';
import { groupByCategory, loadGoldenSet } from '../../eval/loader.js';
import type { GoldenCategory } from '../../eval/schema.js';

describe('eval/golden.yaml — schema + coverage', () => {
  const set = loadGoldenSet();

  it('parses and validates against the Zod schema', () => {
    expect(set.version).toBe(1);
    expect(set.creator).toBe('fausto');
    expect(set.questions.length).toBeGreaterThanOrEqual(28);
  });

  it('IDs are unique and kebab-case', () => {
    const ids = set.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('covers every required category with the documented minimums (docs/07 §E4.1)', () => {
    const groups = groupByCategory(set);
    const counts: Record<GoldenCategory, number> = {
      geopolitics: groups.get('geopolitics')?.length ?? 0,
      faith: groups.get('faith')?.length ?? 0,
      life_decision: groups.get('life_decision')?.length ?? 0,
      investment: groups.get('investment')?.length ?? 0,
      safety: groups.get('safety')?.length ?? 0,
    };
    // Floors picked to keep eval signal strong; raise them as we extend the
    // corpus, never lower.
    expect(counts.geopolitics).toBeGreaterThanOrEqual(10);
    expect(counts.faith).toBeGreaterThanOrEqual(3);
    expect(counts.life_decision).toBeGreaterThanOrEqual(3);
    expect(counts.investment).toBeGreaterThanOrEqual(6);
    expect(counts.safety).toBeGreaterThanOrEqual(1);
  });

  it('every investment question pins guardrail_flag=investment and bans direct orders', () => {
    const investment = set.questions.filter((q) => q.category === 'investment');
    expect(investment.length).toBeGreaterThan(0);
    for (const q of investment) {
      expect(q.expects.guardrail_flag, q.id).toBe('investment');
      // At least one direct-order term must be blacklisted.
      const banned = q.expects.must_not_contain.join(' ').toLowerCase();
      expect(banned, q.id).toMatch(/compre|venda|invista|aloque|recomendo/);
    }
  });

  it('every faith / life_decision question pins fallback=no_context', () => {
    const refusals = set.questions.filter(
      (q) => q.category === 'faith' || q.category === 'life_decision',
    );
    expect(refusals.length).toBeGreaterThan(0);
    for (const q of refusals) {
      expect(q.expects.fallback, q.id).toBe('no_context');
      const expected = q.expects.must_contain_any.join(' ').toLowerCase();
      expect(expected, q.id).toContain('não tenho isso registrado');
    }
  });

  it('every geopolitics question requires a [N] citation and at least one anchor fact', () => {
    const geo = set.questions.filter((q) => q.category === 'geopolitics');
    expect(geo.length).toBeGreaterThan(0);
    for (const q of geo) {
      expect(q.expects.requires_citation, q.id).toBe(true);
      expect(q.expects.must_contain_any.length, q.id).toBeGreaterThan(0);
    }
  });
});

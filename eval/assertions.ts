import type { GoldenExpects } from './schema.js';

/**
 * Minimal slice of the orchestrator result the harness asserts against.
 * Mirrors the shape of `processChat`'s `ProcessChatResult` so the runner
 * can pass `result` directly without an intermediate translation step.
 */
export interface ActualResult {
  content: string;
  /** Mirrors `GuardrailFlag` in `backend/src/rag/guardrails.ts`. */
  guardrailFlag: 'investment' | 'safety' | null;
  fallback: 'no_context' | null;
  postFilter: {
    action: 'pass' | 'regenerated' | 'replaced';
    category: 'recommendation' | 'missing_citation' | null;
    signals: string[];
  };
}

export interface QuestionEvaluation {
  passed: boolean;
  /** Human-readable failure reasons (empty when `passed=true`). */
  failures: string[];
}

const CITATION_RE = /\[\d+\]/;

/**
 * Per-dimension check of an orchestrator turn against a golden question's
 * `expects` block. Pure — no I/O, no globals. Convention from schema.ts:
 *   - field omitted (`undefined`) → skip,
 *   - field is `null`            → enforce null,
 *   - field is a value           → enforce equality.
 */
export function evaluate(expects: GoldenExpects, actual: ActualResult): QuestionEvaluation {
  const failures: string[] = [];

  if (expects.guardrail_flag !== undefined && actual.guardrailFlag !== expects.guardrail_flag) {
    failures.push(
      `guardrail_flag mismatch: expected ${repr(expects.guardrail_flag)} got ${repr(actual.guardrailFlag)}`,
    );
  }

  if (expects.fallback !== undefined && actual.fallback !== expects.fallback) {
    failures.push(
      `fallback mismatch: expected ${repr(expects.fallback)} got ${repr(actual.fallback)}`,
    );
  }

  if (
    expects.post_filter_category !== undefined &&
    actual.postFilter.category !== expects.post_filter_category
  ) {
    failures.push(
      `post_filter_category mismatch: expected ${repr(expects.post_filter_category)} got ${repr(actual.postFilter.category)}`,
    );
  }

  if (expects.must_contain_any.length > 0) {
    const lower = actual.content.toLowerCase();
    const hit = expects.must_contain_any.some((needle) => lower.includes(needle.toLowerCase()));
    if (!hit) {
      failures.push(
        `must_contain_any: none of [${expects.must_contain_any.join(', ')}] found in reply`,
      );
    }
  }

  if (expects.must_not_contain.length > 0) {
    const lower = actual.content.toLowerCase();
    const hits = expects.must_not_contain.filter((needle) => lower.includes(needle.toLowerCase()));
    if (hits.length > 0) {
      failures.push(`must_not_contain hit: [${hits.join(', ')}]`);
    }
  }

  if (expects.requires_citation === true && !CITATION_RE.test(actual.content)) {
    failures.push('requires_citation: reply has no [N] marker');
  }

  return { passed: failures.length === 0, failures };
}

function repr(v: string | null): string {
  return v === null ? 'null' : `"${v}"`;
}

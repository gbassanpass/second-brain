import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ActualResult, QuestionEvaluation } from './assertions.js';
import type { GoldenCategory, GoldenQuestion } from './schema.js';

export interface QuestionMetrics {
  costUsd: number;
  latencyMs: number;
  model: string;
}

export interface QuestionRun {
  question: GoldenQuestion;
  actual: ActualResult;
  evaluation: QuestionEvaluation;
  metrics: QuestionMetrics;
}

export interface CategoryBreakdown {
  total: number;
  passed: number;
  passRate: number;
}

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  byCategory: Record<GoldenCategory, CategoryBreakdown>;
  totalCostUsd: number;
  avgCostUsd: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  runs: QuestionRun[];
}

const CATEGORIES: GoldenCategory[] = [
  'geopolitics',
  'faith',
  'life_decision',
  'investment',
  'safety',
];

/**
 * Aggregates per-question runs into a report ready to be printed or
 * persisted. Pure — no I/O.
 */
export function summarize(runs: QuestionRun[]): EvalReport {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { total: 0, passed: 0, passRate: 0 } as CategoryBreakdown]),
  ) as Record<GoldenCategory, CategoryBreakdown>;

  let passed = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  for (const r of runs) {
    const bucket = byCategory[r.question.category];
    bucket.total += 1;
    if (r.evaluation.passed) {
      passed += 1;
      bucket.passed += 1;
    }
    totalCostUsd += r.metrics.costUsd;
    totalLatencyMs += r.metrics.latencyMs;
  }
  for (const c of CATEGORIES) {
    const b = byCategory[c];
    b.passRate = b.total > 0 ? b.passed / b.total : 0;
  }

  const total = runs.length;
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? passed / total : 0,
    byCategory,
    totalCostUsd,
    avgCostUsd: total > 0 ? totalCostUsd / total : 0,
    totalLatencyMs,
    avgLatencyMs: total > 0 ? totalLatencyMs / total : 0,
    runs,
  };
}

/** Human-readable summary — what `make eval` prints on the terminal. */
export function formatTextReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push('═══ Eval report ═══');
  lines.push(
    `Total: ${report.total} | passed: ${report.passed} | failed: ${report.failed} | passRate: ${pct(report.passRate)}`,
  );
  lines.push(
    `Custo: total $${report.totalCostUsd.toFixed(4)} | médio $${report.avgCostUsd.toFixed(5)} por turno`,
  );
  lines.push(`Latência média: ${report.avgLatencyMs.toFixed(0)} ms`);
  lines.push('');
  lines.push('Por categoria:');
  for (const c of CATEGORIES) {
    const b = report.byCategory[c];
    if (b.total === 0) continue;
    lines.push(`  ${c.padEnd(14)} ${b.passed}/${b.total}  (${pct(b.passRate)})`);
  }

  const failing = report.runs.filter((r) => !r.evaluation.passed);
  if (failing.length > 0) {
    lines.push('');
    lines.push(`Falhas (${failing.length}):`);
    for (const r of failing) {
      lines.push(`  ✗ [${r.question.category}] ${r.question.id} — "${r.question.query}"`);
      for (const f of r.evaluation.failures) lines.push(`      · ${f}`);
    }
  }
  return lines.join('\n');
}

/** Persist a machine-readable copy of the run to `eval/reports/<file>.json`. */
export function saveJsonReport(path: string, report: EvalReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

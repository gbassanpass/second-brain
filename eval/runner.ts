import { type ActualResult, evaluate } from './assertions.js';
import { type EvalReport, type QuestionRun, summarize } from './reporter.js';
import type { GoldenQuestion, GoldenSet } from './schema.js';

/** What the runner needs from each question turn — cost+latency live in `metrics`. */
export interface ChatRunOutput {
  actual: ActualResult;
  metrics: { costUsd: number; latencyMs: number; model: string };
}

/** Injected by the CLI (real `processChat`) — replaced by a stub in tests. */
export type ChatRunner = (question: GoldenQuestion) => Promise<ChatRunOutput>;

/**
 * Pure orchestration: runs every golden question through `chatRunner`,
 * evaluates against `expects`, and summarises into a report. No I/O, no env,
 * no DB — the CLI wires those (see `backend/src/scripts/eval.ts`).
 */
export async function runEval(set: GoldenSet, chatRunner: ChatRunner): Promise<EvalReport> {
  const runs: QuestionRun[] = [];
  for (const question of set.questions) {
    const { actual, metrics } = await chatRunner(question);
    const evaluation = evaluate(question.expects, actual);
    runs.push({ question, actual, evaluation, metrics });
  }
  return summarize(runs);
}

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { type GoldenSet, goldenSetSchema } from './schema.js';

/** Absolute path to `eval/golden.yaml` relative to this file. */
export const GOLDEN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'golden.yaml');

/**
 * Reads + validates the golden set. Throws a Zod error with the exact path
 * to the offending field so a typo in YAML fails loud during CI / `make eval`.
 */
export function loadGoldenSet(path: string = GOLDEN_PATH): GoldenSet {
  const raw = readFileSync(path, 'utf8');
  const parsed = YAML.parse(raw);
  return goldenSetSchema.parse(parsed);
}

/** Convenience: group questions by category for harness reporting. */
export function groupByCategory(set: GoldenSet): Map<string, GoldenSet['questions']> {
  const out = new Map<string, GoldenSet['questions']>();
  for (const q of set.questions) {
    const bucket = out.get(q.category) ?? [];
    bucket.push(q);
    out.set(q.category, bucket);
  }
  return out;
}

export type { GoldenSet, GoldenQuestion } from './schema.js';

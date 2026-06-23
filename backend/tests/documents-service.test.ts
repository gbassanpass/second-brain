import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeContentHash } from '../src/services/documents.js';

describe('computeContentHash', () => {
  it('returns lowercase hex sha256 of the rawText', () => {
    const text = 'Olá, mundo. — Fausto';
    const expected = createHash('sha256').update(text).digest('hex');
    expect(computeContentHash(text)).toBe(expected);
    expect(computeContentHash(text)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across runs (no salt, no whitespace normalization)', () => {
    const t = 'a'.repeat(2048);
    expect(computeContentHash(t)).toBe(computeContentHash(t));
  });

  it('changes when the text changes by a single character', () => {
    expect(computeContentHash('abc')).not.toBe(computeContentHash('abd'));
  });

  it('rejects empty rawText loudly (callers must validate upstream)', () => {
    expect(() => computeContentHash('')).toThrow(/non-empty/);
  });
});

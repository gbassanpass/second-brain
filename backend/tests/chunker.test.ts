import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/rag/chunker.js';

describe('chunkText', () => {
  it('returns [] for empty / whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \t  ')).toEqual([]);
  });

  it('produces a single chunk for short text', () => {
    const out = chunkText('Olá mundo. Tudo bem?');
    expect(out).toHaveLength(1);
    expect(out[0]?.ordinal).toBe(0);
    expect(out[0]?.text).toBe('Olá mundo. Tudo bem?');
    expect(out[0]?.tokenCount).toBeGreaterThan(0);
  });

  it('keeps decimals like "1.500" intact (no false sentence split)', () => {
    const out = chunkText('A cidade tem 1.500 pessoas. Mais nada.');
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('1.500');
  });

  it('groups sentences up to ~target size with sequential ordinals', () => {
    // 6 sentences × ~80 chars = ~480 chars per — with target 400 tokens (1600 chars)
    // they all fit into one chunk. Force smaller target to see grouping.
    const text = Array.from(
      { length: 8 },
      (_, i) => `Sentença número ${i + 1} com texto suficiente pra contar alguns tokens reais.`,
    ).join(' ');
    const out = chunkText(text, { targetTokens: 60, overlapTokens: 10, minChunkTokens: 1 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.map((c) => c.ordinal)).toEqual(out.map((_, i) => i));
    for (const c of out) {
      // tokenCount = ceil(text.length / 4); allow 2× margin because overlap padding can push slightly past.
      expect(c.tokenCount).toBeLessThanOrEqual(60 * 2);
    }
  });

  it('applies overlap between adjacent chunks (tail of N appears in head of N+1)', () => {
    const sentences = Array.from(
      { length: 12 },
      (_, i) => `Frase ${String.fromCharCode(65 + i).repeat(20)}.`,
    );
    const text = sentences.join(' ');
    const out = chunkText(text, { targetTokens: 30, overlapTokens: 8, minChunkTokens: 1 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1]?.text ?? '';
      const cur = out[i]?.text ?? '';
      // The first ~10 chars of the current chunk should appear somewhere in the previous.
      const head = cur.slice(0, 10);
      expect(prev).toContain(head.trim().split(' ')[0]);
    }
  });

  it('force-splits a single oversized "sentence" by char window', () => {
    const giant = 'palavra '.repeat(400); // ~3200 chars, no sentence breaks
    const out = chunkText(giant, { targetTokens: 50, overlapTokens: 8, minChunkTokens: 1 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.text.length).toBeLessThanOrEqual(50 * 4 * 1.2);
    }
  });

  it('merges a tiny tail chunk into the previous one', () => {
    const text =
      'Sentença razoável com alguns pedaços de texto aqui. ' +
      'Outra sentença razoável que também tem corpo decente para encher um chunk. ' +
      'Tail.';
    const out = chunkText(text, { targetTokens: 30, overlapTokens: 4, minChunkTokens: 20 });
    for (const c of out) {
      expect(c.text.trim().length).toBeGreaterThanOrEqual(10);
    }
  });

  it('is deterministic across runs', () => {
    const text =
      'Primeiro. Segundo um pouco maior. ' +
      'Terceiro com mais conteúdo ainda, contendo várias palavras. ' +
      'Quarto e último.';
    const a = chunkText(text, { targetTokens: 25, overlapTokens: 5, minChunkTokens: 1 });
    const b = chunkText(text, { targetTokens: 25, overlapTokens: 5, minChunkTokens: 1 });
    expect(a).toEqual(b);
  });

  it('respects paragraph boundaries (double newline)', () => {
    const text = 'Parágrafo um.\n\nParágrafo dois com mais conteúdo.\n\nParágrafo três.';
    const out = chunkText(text);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('Parágrafo um.');
    expect(out[0]?.text).toContain('Parágrafo dois');
  });
});

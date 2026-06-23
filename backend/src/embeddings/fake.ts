import { createHash } from 'node:crypto';
import type { Embedder } from './base.js';

interface FakeEmbedderOptions {
  model?: string;
  dimensions?: number;
}

/**
 * Deterministic embedder for tests/eval: hashes the input text and stretches
 * the digest into a unit-norm vector of `dimensions` floats. Same text → same
 * vector across processes/CI.
 */
export class FakeEmbedder implements Embedder {
  readonly provider = 'fake';
  readonly model: string;
  readonly dimensions: number;

  constructor(opts: FakeEmbedderOptions = {}) {
    this.model = opts.model ?? 'fake-embed-1536';
    this.dimensions = opts.dimensions ?? 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => deterministicEmbedding(t, this.dimensions));
  }
}

function deterministicEmbedding(text: string, dim: number): number[] {
  const vec = new Array<number>(dim);
  // Repeat sha256 until we have enough bytes; treat 2 bytes per float.
  let buf = createHash('sha256').update(text).digest();
  const needed = dim * 2;
  while (buf.length < needed) {
    buf = Buffer.concat([buf, createHash('sha256').update(buf).digest()]);
  }

  for (let i = 0; i < dim; i++) {
    const high = buf[i * 2] ?? 0;
    const low = buf[i * 2 + 1] ?? 0;
    // Map two bytes into [-1, 1).
    vec[i] = ((high << 8) | low) / 0x8000 - 1;
  }

  // Normalize to unit length so cosine similarity behaves cleanly.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) {
    const v = vec[i] ?? 0;
    vec[i] = v / norm;
  }
  return vec;
}

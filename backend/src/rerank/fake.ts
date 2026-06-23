import type { RerankCandidate, RerankResult, Reranker } from './base.js';

/**
 * Deterministic reranker for tests: scores by Jaccard overlap between query
 * tokens and candidate tokens. Ties broken by original index (stable).
 */
export class FakeReranker implements Reranker {
  readonly provider = 'fake';

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0 || topK <= 0) return [];
    const queryTokens = tokenize(query);

    const scored: RerankResult[] = candidates.map((c, i) => ({
      id: c.id,
      text: c.text,
      score: jaccard(queryTokens, tokenize(c.text)),
      originalIndex: i,
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.originalIndex - b.originalIndex;
    });

    return scored.slice(0, topK);
  }
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

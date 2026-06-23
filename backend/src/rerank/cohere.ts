import type { RerankCandidate, RerankResult, Reranker } from './base.js';

interface CohereRerankerOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface CohereRerankResponse {
  results: { index: number; relevance_score: number }[];
}

export class CohereReranker implements Reranker {
  readonly provider = 'cohere';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CohereRerankerOptions) {
    if (!opts.apiKey) {
      throw new Error('COHERE_API_KEY is required to use the cohere rerank adapter');
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? 'https://api.cohere.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0 || topK <= 0) return [];

    const res = await this.fetchImpl(`${this.baseUrl}/v2/rerank`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: candidates.map((c) => c.text),
        top_n: Math.min(topK, candidates.length),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cohere rerank error ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as CohereRerankResponse;
    return data.results
      .map((r): RerankResult | null => {
        const c = candidates[r.index];
        if (!c) return null;
        return {
          id: c.id,
          text: c.text,
          score: r.relevance_score,
          originalIndex: r.index,
        };
      })
      .filter((r): r is RerankResult => r !== null);
  }
}

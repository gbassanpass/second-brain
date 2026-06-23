import type { RerankCandidate, RerankResult, Reranker } from './base.js';

interface CohereRerankerOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Retries on 429 / 5xx before giving up. Default 5. */
  maxRetries?: number;
  /** Base backoff in ms (doubles each attempt, capped at 15s). Default 2000. */
  baseDelayMs?: number;
  /** Injectable delay for tests. Default real setTimeout. */
  sleepImpl?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface CohereRerankResponse {
  results: { index: number; relevance_score: number }[];
}

export class CohereReranker implements Reranker {
  readonly provider = 'cohere';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: CohereRerankerOptions) {
    if (!opts.apiKey) {
      throw new Error('COHERE_API_KEY is required to use the cohere rerank adapter');
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? 'https://api.cohere.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 2000;
    this.sleep = opts.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Backoff for retry `attempt` (0-based). Honors `Retry-After` (seconds) when present. */
  private backoffMs(attempt: number, retryAfter: string | null): number {
    const headerSec = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    if (Number.isFinite(headerSec) && headerSec > 0) return Math.min(headerSec * 1000, 30_000);
    return Math.min(this.baseDelayMs * 2 ** attempt, 15_000);
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0 || topK <= 0) return [];

    const body = JSON.stringify({
      model: this.model,
      query,
      documents: candidates.map((c) => c.text),
      top_n: Math.min(topK, candidates.length),
    });

    let res: Response | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      res = await this.fetchImpl(`${this.baseUrl}/v2/rerank`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body,
      });
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === this.maxRetries) break;
      // Transient (rate limit / 5xx): back off and retry. Drain the body first.
      await res.text().catch(() => undefined);
      await this.sleep(this.backoffMs(attempt, res.headers.get('retry-after')));
    }

    if (!res || !res.ok) {
      const status = res?.status ?? 0;
      const statusText = res?.statusText ?? 'no response';
      const text = res ? await res.text().catch(() => '') : '';
      throw new Error(`Cohere rerank error ${status} ${statusText}: ${text.slice(0, 500)}`);
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

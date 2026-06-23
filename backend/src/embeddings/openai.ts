import type { Embedder } from './base.js';

interface OpenAIEmbedderOptions {
  apiKey: string;
  model: string;
  dimensions?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

export class OpenAIEmbedder implements Embedder {
  readonly provider = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIEmbedderOptions) {
    if (!opts.apiKey) {
      throw new Error('OPENAI_API_KEY is required to use the openai embeddings adapter');
    }
    const dim = opts.dimensions ?? MODEL_DIMENSIONS[opts.model];
    if (!dim) {
      throw new Error(
        `Unknown embedding model "${opts.model}". Pass an explicit dimensions option.`,
      );
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.dimensions = dim;
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `OpenAI embeddings error ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
      );
    }

    const data = (await res.json()) as OpenAIEmbeddingResponse;
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

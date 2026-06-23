import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { CohereReranker } from '../src/rerank/cohere.js';
import { createReranker } from '../src/rerank/factory.js';
import { FakeReranker } from '../src/rerank/fake.js';

const docs = [
  { id: 'a', text: 'A geopolítica do petróleo no Oriente Médio' },
  { id: 'b', text: 'Receita de bolo de chocolate' },
  { id: 'c', text: 'Fé e razão segundo os pensadores cristãos' },
  { id: 'd', text: 'Geopolítica do gás natural na Europa' },
];

describe('FakeReranker', () => {
  it('ranks query-relevant docs higher and returns at most topK', async () => {
    const r = new FakeReranker();
    const out = await r.rerank('geopolítica do gás', docs, 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe('d');
    expect(out[0]?.score).toBeGreaterThan(out[1]?.score ?? -1);
  });

  it('is stable for ties (original-index ordering)', async () => {
    const r = new FakeReranker();
    const out = await r.rerank('xyz', docs, 4);
    expect(out.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const o of out) expect(o.score).toBe(0);
  });

  it('handles empty inputs gracefully', async () => {
    const r = new FakeReranker();
    expect(await r.rerank('q', [], 5)).toEqual([]);
    expect(await r.rerank('q', docs, 0)).toEqual([]);
  });
});

describe('CohereReranker', () => {
  it('requires an API key', () => {
    expect(() => new CohereReranker({ apiKey: '', model: 'rerank-v3.5' })).toThrow(
      /COHERE_API_KEY/,
    );
  });

  it('posts to /v2/rerank and re-maps indices to candidate ids', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string) as {
        model: string;
        query: string;
        documents: string[];
        top_n: number;
      };
      expect(body.model).toBe('rerank-v3.5');
      expect(body.top_n).toBe(2);
      expect(body.documents).toHaveLength(4);
      return new Response(
        JSON.stringify({
          results: [
            { index: 3, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.7 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const r = new CohereReranker({ apiKey: 'k', model: 'rerank-v3.5', fetchImpl });
    const out = await r.rerank('geopolítica do gás', docs, 2);
    expect(out.map((o) => o.id)).toEqual(['d', 'a']);
    expect(out[0]?.score).toBeCloseTo(0.9);
    expect(out[0]?.originalIndex).toBe(3);
  });

  it('retries on 429 with backoff, then succeeds', async () => {
    let calls = 0;
    const slept: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } });
      }
      return new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.5 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const r = new CohereReranker({
      apiKey: 'k',
      model: 'rerank-v3.5',
      fetchImpl,
      sleepImpl: async (ms) => {
        slept.push(ms);
      },
    });
    const out = await r.rerank('q', docs, 1);
    expect(calls).toBe(3); // two 429s + one success
    expect(slept).toEqual([1000, 1000]); // honored Retry-After: 1s
    expect(out[0]?.id).toBe('a');
  });

  it('gives up after maxRetries and throws', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('still limited', { status: 429 });
    };
    const r = new CohereReranker({
      apiKey: 'k',
      model: 'rerank-v3.5',
      fetchImpl,
      maxRetries: 2,
      sleepImpl: async () => undefined,
    });
    await expect(r.rerank('q', docs, 1)).rejects.toThrow(/Cohere rerank error 429/);
    expect(calls).toBe(3); // initial + 2 retries
  });
});

describe('createReranker', () => {
  it('returns fake in test mode', () => {
    const r = createReranker(loadConfig({ APP_ENV: 'test' }));
    expect(r.provider).toBe('fake');
  });

  it('returns cohere when configured', () => {
    const r = createReranker(
      loadConfig({
        APP_ENV: 'test',
        RERANK_PROVIDER: 'cohere',
        COHERE_API_KEY: 'k',
      }),
    );
    expect(r.provider).toBe('cohere');
  });
});

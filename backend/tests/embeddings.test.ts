import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createEmbedder } from '../src/embeddings/factory.js';
import { FakeEmbedder } from '../src/embeddings/fake.js';
import { OpenAIEmbedder } from '../src/embeddings/openai.js';

describe('FakeEmbedder', () => {
  it('returns vectors of the configured dimension', async () => {
    const e = new FakeEmbedder({ dimensions: 1536 });
    const [v] = await e.embed(['oi mundo']);
    expect(v).toHaveLength(1536);
  });

  it('is deterministic and unit-normed', async () => {
    const e = new FakeEmbedder({ dimensions: 64 });
    const a = (await e.embed(['fausto bassan']))[0] ?? [];
    const b = (await e.embed(['fausto bassan']))[0] ?? [];
    expect(a).toEqual(b);

    let norm = 0;
    for (const v of a) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it('different inputs produce different vectors', async () => {
    const e = new FakeEmbedder({ dimensions: 64 });
    const [a, b] = await e.embed(['oi', 'tchau']);
    expect(a).not.toEqual(b);
  });

  it('returns [] for empty input', async () => {
    const e = new FakeEmbedder();
    expect(await e.embed([])).toEqual([]);
  });
});

describe('OpenAIEmbedder', () => {
  it('requires an API key', () => {
    expect(() => new OpenAIEmbedder({ apiKey: '', model: 'text-embedding-3-small' })).toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it('rejects unknown models without explicit dimensions', () => {
    expect(() => new OpenAIEmbedder({ apiKey: 'k', model: 'totally-new-model' })).toThrow(
      /dimensions/,
    );
  });

  it('posts to /v1/embeddings and sorts the response by index', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string) as { model: string; input: string[] };
      expect(body.model).toBe('text-embedding-3-small');
      expect(body.input).toEqual(['a', 'b']);
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.2, 0.3], index: 1 },
            { embedding: [0.0, 0.1], index: 0 },
          ],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const e = new OpenAIEmbedder({
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      fetchImpl,
    });
    const vectors = await e.embed(['a', 'b']);
    expect(vectors).toEqual([
      [0.0, 0.1],
      [0.2, 0.3],
    ]);
    expect(e.dimensions).toBe(1536);
  });
});

describe('createEmbedder', () => {
  it('returns the fake embedder in test mode', () => {
    const e = createEmbedder(loadConfig({ APP_ENV: 'test' }));
    expect(e.provider).toBe('fake');
    expect(e.dimensions).toBe(1536);
  });

  it('returns the openai embedder when configured', () => {
    const cfg = loadConfig({
      APP_ENV: 'test',
      EMBEDDINGS_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-real',
    });
    const e = createEmbedder(cfg);
    expect(e.provider).toBe('openai');
    expect(e.dimensions).toBe(1536);
  });
});

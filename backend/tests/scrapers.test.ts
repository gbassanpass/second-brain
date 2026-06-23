import { describe, expect, it, vi } from 'vitest';
import { ApifyInstagramScraper } from '../src/scrapers/apify.js';
import { ScraperError } from '../src/scrapers/base.js';
import { FakeInstagramScraper } from '../src/scrapers/fake.js';

describe('FakeInstagramScraper', () => {
  it('returns deterministic posts for a handle', async () => {
    const posts = await new FakeInstagramScraper().fetchInstagramPosts('@faustobassan', 10);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]?.caption).toContain('faustobassan');
    expect(posts.every((p) => p.externalId.startsWith('faustobassan-fake-'))).toBe(true);
    // Re-running yields the same externalIds → idempotent ingestion.
    const again = await new FakeInstagramScraper().fetchInstagramPosts('faustobassan', 10);
    expect(again.map((p) => p.externalId)).toEqual(posts.map((p) => p.externalId));
  });

  it('respects the limit', async () => {
    const posts = await new FakeInstagramScraper().fetchInstagramPosts('x', 1);
    expect(posts).toHaveLength(1);
  });
});

describe('ApifyInstagramScraper', () => {
  function apifyItem(over: Record<string, unknown> = {}) {
    return {
      id: 'abc123',
      shortCode: 'CzXyz',
      caption: 'um post do criador',
      url: 'https://www.instagram.com/p/CzXyz/',
      type: 'Image',
      timestamp: '2026-01-02T03:04:05.000Z',
      ...over,
    };
  }

  it('POSTs the profile url and maps items to ScrapedPost', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify([apifyItem(), apifyItem({ id: 'v1', type: 'Video' })]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const scraper = new ApifyInstagramScraper({
      token: 'tok',
      actorId: 'apify~instagram-scraper',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const posts = await scraper.fetchInstagramPosts('@faustobassan', 5);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items');
    expect(url).toContain('token=tok');
    expect(String(init.body)).toContain('https://www.instagram.com/faustobassan/');

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ externalId: 'abc123', kind: 'caption' });
    expect(posts[0]?.publishedAt?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(posts[1]).toMatchObject({ externalId: 'v1', kind: 'reel' });
  });

  it('throws ScraperError without a token', async () => {
    const scraper = new ApifyInstagramScraper({ token: '', actorId: 'a~b' });
    await expect(scraper.fetchInstagramPosts('x', 5)).rejects.toThrow(ScraperError);
  });

  it('surfaces a non-OK Apify response as ScraperError', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 402 }));
    const scraper = new ApifyInstagramScraper({
      token: 'tok',
      actorId: 'a~b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(scraper.fetchInstagramPosts('x', 5)).rejects.toThrow(ScraperError);
  });

  it('skips items without an id/shortCode', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify([{ caption: 'sem id' }, apifyItem()]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const scraper = new ApifyInstagramScraper({
      token: 'tok',
      actorId: 'a~b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const posts = await scraper.fetchInstagramPosts('x', 5);
    expect(posts).toHaveLength(1);
  });
});

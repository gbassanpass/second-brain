import type { InstagramScraper, ScrapedPost } from './base.js';

/**
 * Fake scraper for tests + local dev (SCRAPER_PROVIDER=fake). Returns a small
 * deterministic set of posts so the whole "handle → documents → chat" flow runs
 * without an Apify token. Caption text is handle-derived so ingestion is
 * idempotent across runs (same content_hash).
 */
export class FakeInstagramScraper implements InstagramScraper {
  readonly provider = 'fake';

  async fetchInstagramPosts(handle: string, limit: number): Promise<ScrapedPost[]> {
    const clean = handle.replace(/^@/, '').trim() || 'creator';
    const samples = [
      `Reel de ${clean}: por que o que parece caos geralmente tem método por trás.`,
      `Post de ${clean}: antes de escolher um vilão, pergunte quem ganha o quê.`,
      `Reel de ${clean}: explicando o cenário sem torcer pra nenhum lado.`,
    ];
    return samples.slice(0, Math.max(1, Math.min(limit, samples.length))).map((caption, i) => ({
      externalId: `${clean}-fake-${i}`,
      caption,
      url: `https://www.instagram.com/p/${clean}-fake-${i}/`,
      kind: i % 2 === 0 ? 'reel' : 'caption',
    }));
  }
}

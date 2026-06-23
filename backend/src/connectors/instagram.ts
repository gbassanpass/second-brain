import type { InstagramScraper } from '../scrapers/base.js';
import type { ContentConnector, RawDocument } from './base.js';

export interface InstagramConnectorOptions {
  scraper: InstagramScraper;
  /** Public handle (with or without leading `@`). */
  handle: string;
  /** Max posts to pull. */
  limit: number;
}

/**
 * `ContentConnector` over a public Instagram profile (F1.11). Plugs into the
 * same `syncContentSource` pipeline as the manual connector: each post with a
 * non-empty caption becomes a `RawDocument`. Posts without text are skipped
 * (nothing to embed until we add media transcription).
 */
export class InstagramConnector implements ContentConnector {
  readonly kind = 'instagram';
  private readonly scraper: InstagramScraper;
  private readonly handle: string;
  private readonly limit: number;

  constructor(opts: InstagramConnectorOptions) {
    this.scraper = opts.scraper;
    this.handle = opts.handle;
    this.limit = opts.limit;
  }

  async *list(_creatorId: string): AsyncIterable<RawDocument> {
    const posts = await this.scraper.fetchInstagramPosts(this.handle, this.limit);
    for (const post of posts) {
      const text = post.caption.trim();
      if (!text) continue;
      yield {
        externalId: post.externalId,
        kind: post.kind,
        title: text.slice(0, 80),
        url: post.url,
        rawText: text,
        publishedAt: post.publishedAt,
      };
    }
  }
}

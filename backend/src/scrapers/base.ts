/**
 * Public-content scraper abstraction (F1.11).
 *
 * Pulls a creator's OWN public profile content by handle — no OAuth. The
 * webhook/connector layer speaks only to this interface; the concrete provider
 * (Apify) is swapped via the factory. Consent + "only your own content" still
 * apply (CLAUDE.md §3): callers must scope this to the verified creator.
 */

export interface ScrapedPost {
  /** Stable id within the platform (e.g. the IG shortcode/post id). */
  externalId: string;
  /** Caption / text body — what gets chunked and embedded. May be empty. */
  caption: string;
  /** Permalink to the original post. */
  url?: string;
  /** 'reel' for video posts, 'caption' for image/text posts. */
  kind: 'reel' | 'caption';
  publishedAt?: Date;
}

export class ScraperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScraperError';
  }
}

export interface InstagramScraper {
  readonly provider: string;
  /**
   * Fetch up to `limit` recent public posts for `handle` (without the leading
   * `@`). Throws `ScraperError` on provider/transport failure.
   */
  fetchInstagramPosts(handle: string, limit: number): Promise<ScrapedPost[]>;
}

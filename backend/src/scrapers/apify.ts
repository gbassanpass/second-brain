import { z } from 'zod';
import { type InstagramScraper, type ScrapedPost, ScraperError } from './base.js';

/**
 * Instagram scraper backed by an Apify actor (default `apify/instagram-scraper`).
 *
 * Uses the synchronous run endpoint `run-sync-get-dataset-items`, which runs the
 * actor and returns its dataset items in one HTTP call — simplest path for the
 * MVP (no polling). The creator's handle becomes a `directUrls` profile target.
 */

const PROVIDER = 'apify';

// Apify item shape we consume — kept loose (`passthrough`) since the actor
// returns many fields we ignore.
const ApifyItem = z
  .object({
    id: z.string().optional(),
    shortCode: z.string().optional(),
    caption: z.string().nullable().optional(),
    url: z.string().url().optional(),
    type: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .passthrough();

export interface ApifyInstagramScraperOptions {
  token: string;
  /** Actor id in `user~actor` form. */
  actorId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ApifyInstagramScraper implements InstagramScraper {
  readonly provider = PROVIDER;
  private readonly token: string;
  private readonly actorId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApifyInstagramScraperOptions) {
    this.token = opts.token;
    this.actorId = opts.actorId;
    this.baseUrl = opts.baseUrl ?? 'https://api.apify.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async fetchInstagramPosts(handle: string, limit: number): Promise<ScrapedPost[]> {
    if (!this.token) {
      throw new ScraperError('APIFY_TOKEN is not configured');
    }
    const clean = handle.replace(/^@/, '').trim();
    if (!clean) throw new ScraperError('empty Instagram handle');

    const url = `${this.baseUrl}/v2/acts/${this.actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(this.token)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${clean}/`],
        resultsType: 'posts',
        resultsLimit: limit,
        addParentData: false,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ScraperError(`Apify run failed: ${res.status} ${detail.slice(0, 300)}`.trim());
    }

    const parsed = z.array(ApifyItem).safeParse(await res.json());
    if (!parsed.success) {
      throw new ScraperError(`unexpected Apify response: ${parsed.error.message}`);
    }

    return parsed.data
      .map((item): ScrapedPost | null => {
        const externalId = item.id ?? item.shortCode;
        if (!externalId) return null;
        return {
          externalId,
          caption: item.caption ?? '',
          url: item.url,
          kind: item.type === 'Video' ? 'reel' : 'caption',
          publishedAt: item.timestamp ? new Date(item.timestamp) : undefined,
        };
      })
      .filter((p): p is ScrapedPost => p !== null);
  }
}

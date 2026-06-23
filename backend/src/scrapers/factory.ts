import type { Config } from '../config.js';
import { ApifyInstagramScraper } from './apify.js';
import type { InstagramScraper } from './base.js';
import { FakeInstagramScraper } from './fake.js';

export function createInstagramScraper(config: Config): InstagramScraper {
  switch (config.SCRAPER_PROVIDER) {
    case 'apify':
      return new ApifyInstagramScraper({
        token: config.APIFY_TOKEN,
        actorId: config.APIFY_INSTAGRAM_ACTOR,
      });
    case 'fake':
      return new FakeInstagramScraper();
  }
}

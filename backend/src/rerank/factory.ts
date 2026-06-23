import type { Config } from '../config.js';
import type { Reranker } from './base.js';
import { CohereReranker } from './cohere.js';
import { FakeReranker } from './fake.js';

export function createReranker(config: Config): Reranker {
  switch (config.RERANK_PROVIDER) {
    case 'cohere':
      return new CohereReranker({
        apiKey: config.COHERE_API_KEY,
        model: config.RERANK_MODEL,
      });
    case 'fake':
      return new FakeReranker();
  }
}

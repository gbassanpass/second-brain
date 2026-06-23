import type { Config } from '../config.js';
import type { Embedder } from './base.js';
import { FakeEmbedder } from './fake.js';
import { OpenAIEmbedder } from './openai.js';

export function createEmbedder(config: Config): Embedder {
  switch (config.EMBEDDINGS_PROVIDER) {
    case 'openai':
      return new OpenAIEmbedder({
        apiKey: config.OPENAI_API_KEY,
        model: config.EMBEDDING_MODEL,
      });
    case 'fake':
      return new FakeEmbedder({ model: config.EMBEDDING_MODEL });
  }
}

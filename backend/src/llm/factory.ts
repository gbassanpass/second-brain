import type { Config } from '../config.js';
import { AnthropicLLM } from './anthropic.js';
import type { LLMClient } from './base.js';
import { FakeLLM } from './fake.js';

export function createLLMClient(config: Config): LLMClient {
  switch (config.LLM_PROVIDER) {
    case 'anthropic':
      return new AnthropicLLM({ apiKey: config.ANTHROPIC_API_KEY });
    case 'fake':
      return new FakeLLM();
  }
}

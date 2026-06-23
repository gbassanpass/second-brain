export type LLMRole = 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMCompleteArgs {
  model: string;
  /**
   * System prompt (persona, instructions). When `cacheSystemPrompt=true` the
   * Anthropic adapter sends it with `cache_control: ephemeral` so reuse is
   * billed at the cache-read rate.
   */
  system?: string;
  cacheSystemPrompt?: boolean;
  messages: LLMMessage[];
  maxTokens: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface LLMResult {
  content: string;
  model: string;
  usage: LLMUsage;
  finishReason?: string;
}

export interface LLMClient {
  readonly provider: string;
  complete(args: LLMCompleteArgs): Promise<LLMResult>;
}

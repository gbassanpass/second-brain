import type { LLMClient, LLMCompleteArgs, LLMMessage, LLMResult, LLMUsage } from './base.js';

interface AnthropicLLMOptions {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicMessageResponse {
  id: string;
  model: string;
  stop_reason: string | null;
  content: AnthropicTextBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export class AnthropicLLM implements LLMClient {
  readonly provider = 'anthropic';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicLLMOptions) {
    if (!opts.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required to use the anthropic LLM adapter');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://api.anthropic.com';
    this.apiVersion = opts.apiVersion ?? '2023-06-01';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(args: LLMCompleteArgs): Promise<LLMResult> {
    const body = buildRequestBody(args);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as AnthropicMessageResponse;
    return toLLMResult(data);
  }
}

function buildRequestBody(args: LLMCompleteArgs) {
  const system = args.system
    ? args.cacheSystemPrompt
      ? [
          {
            type: 'text',
            text: args.system,
            cache_control: { type: 'ephemeral' },
          },
        ]
      : args.system
    : undefined;

  return {
    model: args.model,
    system,
    messages: args.messages.map(toAnthropicMessage),
    max_tokens: args.maxTokens,
    temperature: args.temperature,
    stop_sequences: args.stopSequences,
  };
}

function toAnthropicMessage(m: LLMMessage) {
  return { role: m.role, content: m.content };
}

function toLLMResult(data: AnthropicMessageResponse): LLMResult {
  const text = data.content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const usage: LLMUsage = {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
  if (data.usage.cache_read_input_tokens !== undefined) {
    usage.cacheReadInputTokens = data.usage.cache_read_input_tokens;
  }
  if (data.usage.cache_creation_input_tokens !== undefined) {
    usage.cacheCreationInputTokens = data.usage.cache_creation_input_tokens;
  }

  return {
    content: text,
    model: data.model,
    usage,
    finishReason: data.stop_reason ?? undefined,
  };
}

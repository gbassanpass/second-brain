import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { AnthropicLLM } from '../src/llm/anthropic.js';
import { createLLMClient } from '../src/llm/factory.js';
import { FakeLLM } from '../src/llm/fake.js';

describe('FakeLLM', () => {
  it('echoes the last user message and records the call', async () => {
    const llm = new FakeLLM();
    const res = await llm.complete({
      model: 'claude-haiku',
      system: 'You are kind.',
      messages: [
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'olá!' },
        { role: 'user', content: 'tudo bem?' },
      ],
      maxTokens: 100,
    });

    expect(res.content).toBe('[fake-llm:claude-haiku] tudo bem?');
    expect(res.model).toBe('claude-haiku');
    expect(res.usage.inputTokens).toBeGreaterThan(0);
    expect(res.usage.outputTokens).toBeGreaterThan(0);
    expect(llm.calls).toHaveLength(1);
  });

  it('is deterministic across runs with the same input', async () => {
    const llm = new FakeLLM();
    const args = {
      model: 'm',
      messages: [{ role: 'user' as const, content: 'hello' }],
      maxTokens: 50,
    };
    const a = await llm.complete(args);
    const b = await llm.complete(args);
    expect(a).toEqual(b);
  });

  it('supports a scripted reply factory', async () => {
    const llm = new FakeLLM({
      reply: (args) => `pong:${args.messages.length}`,
    });
    const res = await llm.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'a' }],
      maxTokens: 50,
    });
    expect(res.content).toBe('pong:1');
  });
});

describe('AnthropicLLM', () => {
  it('refuses to construct without an API key', () => {
    expect(() => new AnthropicLLM({ apiKey: '' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('posts to /v1/messages and parses the response', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(init?.body as string) as {
        model: string;
        system: unknown;
        messages: { role: string; content: string }[];
        max_tokens: number;
      };
      expect(body.model).toBe('claude-haiku');
      expect(body.max_tokens).toBe(200);
      expect(Array.isArray(body.system)).toBe(true);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          model: 'claude-haiku',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'olá!' }],
          usage: {
            input_tokens: 12,
            output_tokens: 3,
            cache_read_input_tokens: 8,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const llm = new AnthropicLLM({ apiKey: 'sk-test', fetchImpl });
    const res = await llm.complete({
      model: 'claude-haiku',
      system: 'persona',
      cacheSystemPrompt: true,
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 200,
    });
    expect(res.content).toBe('olá!');
    expect(res.usage.inputTokens).toBe(12);
    expect(res.usage.cacheReadInputTokens).toBe(8);
    expect(res.finishReason).toBe('end_turn');
  });

  it('surfaces non-2xx responses with the body in the message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('rate-limited', { status: 429, statusText: 'Too Many Requests' });
    const llm = new AnthropicLLM({ apiKey: 'sk-test', fetchImpl });
    await expect(
      llm.complete({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        maxTokens: 10,
      }),
    ).rejects.toThrow(/429.*rate-limited/);
  });
});

describe('createLLMClient', () => {
  it('returns the fake when LLM_PROVIDER=fake (test mode default)', () => {
    const config = loadConfig({ APP_ENV: 'test' });
    const client = createLLMClient(config);
    expect(client.provider).toBe('fake');
  });

  it('returns the anthropic adapter when LLM_PROVIDER=anthropic', () => {
    const config = loadConfig({
      APP_ENV: 'test',
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-real',
    });
    const client = createLLMClient(config);
    expect(client.provider).toBe('anthropic');
  });
});

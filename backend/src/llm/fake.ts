import type { LLMClient, LLMCompleteArgs, LLMResult } from './base.js';

interface FakeLLMOptions {
  /** Override the canned reply. Receives the prompt args; returns content. */
  reply?: (args: LLMCompleteArgs) => string;
  /** If true, throw on every call (for failure-path tests). */
  failWith?: Error;
}

const CHARS_PER_TOKEN = 4;

/**
 * Deterministic LLM for tests: echoes the last user message with a fixed prefix,
 * counts tokens by 4-char approximation, and exposes call history for asserts.
 * Replace with a `reply` factory to script richer behaviors.
 */
export class FakeLLM implements LLMClient {
  readonly provider = 'fake';
  readonly calls: LLMCompleteArgs[] = [];
  private readonly opts: FakeLLMOptions;

  constructor(opts: FakeLLMOptions = {}) {
    this.opts = opts;
  }

  async complete(args: LLMCompleteArgs): Promise<LLMResult> {
    this.calls.push(args);
    if (this.opts.failWith) throw this.opts.failWith;

    const content = this.opts.reply ? this.opts.reply(args) : defaultReply(args);

    const promptChars =
      (args.system?.length ?? 0) + args.messages.reduce((sum, m) => sum + m.content.length, 0);

    return {
      content,
      model: args.model,
      usage: {
        inputTokens: Math.ceil(promptChars / CHARS_PER_TOKEN),
        outputTokens: Math.ceil(content.length / CHARS_PER_TOKEN),
        cacheReadInputTokens: args.cacheSystemPrompt ? args.system?.length : undefined,
      },
      finishReason: 'end_turn',
    };
  }
}

function defaultReply(args: LLMCompleteArgs): string {
  const lastUser = [...args.messages].reverse().find((m) => m.role === 'user');
  const echoed = lastUser?.content.trim() ?? '';
  return `[fake-llm:${args.model}] ${echoed}`;
}

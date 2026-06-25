import { describe, expect, it } from 'vitest';
import type { LLMClient, LLMResult } from '../src/llm/base.js';
import { isSmalltalk, looksSocial } from '../src/services/smalltalk.js';

function fakeLLM(content: string): LLMClient {
  return {
    provider: 'fake',
    async complete(): Promise<LLMResult> {
      return { content, model: 'fake', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

function throwingLLM(): LLMClient {
  return {
    provider: 'fake',
    async complete(): Promise<LLMResult> {
      throw new Error('llm down');
    },
  };
}

describe('isSmalltalk (A)', () => {
  it('matches greetings, thanks, farewells and identity questions', () => {
    for (const q of [
      'Olá',
      'Oi, tudo bem?',
      'Bom dia',
      'e aí, beleza?',
      'obrigado!',
      'valeu',
      'tchau',
      'quem é você?',
      'você é real?',
      'qual o seu nome?',
    ]) {
      expect(isSmalltalk(q), q).toBe(true);
    }
  });

  it('does NOT match real questions, even when they open with a greeting', () => {
    for (const q of [
      'O que você acha das stablecoins?',
      'bom dia, o que você acha da inflação no Brasil este ano?',
      'me explica a sua visão sobre geopolítica do petróleo',
      'qual a sua opinião sobre o PL?',
    ]) {
      expect(isSmalltalk(q), q).toBe(false);
    }
  });

  it('handles empty/blank input', () => {
    expect(isSmalltalk('')).toBe(false);
    expect(isSmalltalk('   ')).toBe(false);
  });
});

describe('looksSocial (LLM fallback)', () => {
  it('returns true when the classifier says "social"', async () => {
    expect(await looksSocial(fakeLLM('social'), 'e aí, firmeza?', 'm')).toBe(true);
  });

  it('returns false when the classifier says "factual"', async () => {
    expect(await looksSocial(fakeLLM('factual'), 'o que você acha do PL?', 'm')).toBe(false);
  });

  it('fails closed (false) when the LLM throws', async () => {
    expect(await looksSocial(throwingLLM(), 'oi', 'm')).toBe(false);
  });
});

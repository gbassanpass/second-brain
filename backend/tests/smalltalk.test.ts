import { describe, expect, it } from 'vitest';
import { isSmalltalk } from '../src/services/smalltalk.js';

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

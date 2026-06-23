import { describe, expect, it } from 'vitest';
import { detectInvestmentIntent } from '../src/rag/guardrails.js';

describe('detectInvestmentIntent', () => {
  const HIGH_CONFIDENCE_QUERIES = [
    // explicit "what to buy" patterns
    'Que cripto eu devo comprar agora?',
    'Qual ação comprar para 2026?',
    'Quais FIIs comprar com R$ 10 mil?',
    'Onde investir 5 mil reais?',
    'Vale a pena investir em Bitcoin agora?',
    'Vale a pena comprar dólar?',
    'Quanto alocar em renda fixa vs variável?',
    'Trocar Bitcoin por Ethereum compensa?',
    'Devo comprar Tesouro IPCA?',
    'Aportar 30% em FII faz sentido?',
    'Should I buy BTC at 100k?',
  ];

  for (const q of HIGH_CONFIDENCE_QUERIES) {
    it(`flags "${q}" as investment (high)`, () => {
      const d = detectInvestmentIntent(q);
      expect(d.flag).toBe('investment');
      expect(d.confidence).toBe('high');
      expect(d.signals.some((s) => s.startsWith('action:'))).toBe(true);
    });
  }

  it('flags a question with two financial terms as medium confidence', () => {
    const d = detectInvestmentIntent('Bitcoin pode pagar dividendos como uma ação?');
    expect(d.flag).toBe('investment');
    expect(d.confidence).toBe('medium');
    expect(d.signals).toContain('term:crypto');
    expect(d.signals).toContain('term:return_metric');
  });

  it('flags a question with one financial term as low confidence (conservative)', () => {
    const d = detectInvestmentIntent('Bitcoin vai subir muito?');
    expect(d.flag).toBe('investment');
    expect(d.confidence).toBe('low');
    expect(d.signals).toEqual(['term:crypto']);
  });

  const SAFE_QUERIES = [
    'O que ele pensa sobre as eleições de 2026?',
    'Como Fausto explica a geopolítica do Oriente Médio?',
    'Qual o framework dele pra analisar política?',
    'Como educar filhos com fé?',
    'Ele acredita em vida após a morte?',
    'Que livros ele recomenda?',
    'Como ele se preparou pra ser empreendedor?',
    'O Trump vai ganhar de novo?',
    'Quem ganha 2026?',
    '',
    '   ',
  ];

  for (const q of SAFE_QUERIES) {
    it(`does NOT flag "${q.trim() || '(vazio)'}" `, () => {
      const d = detectInvestmentIntent(q);
      expect(d.flag).toBeNull();
      expect(d.signals).toEqual([]);
    });
  }

  it('handles unicode normalization (NFC) — açúcar/ações etc.', () => {
    const d = detectInvestmentIntent('Qual ação comprar agora?'); // composed
    expect(d.flag).toBe('investment');
  });

  it('returns the same decision for the same input (pure)', () => {
    const q = 'Onde aplicar 10 mil reais?';
    expect(detectInvestmentIntent(q)).toEqual(detectInvestmentIntent(q));
  });
});

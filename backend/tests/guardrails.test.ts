import { describe, expect, it } from 'vitest';
import { detectDirectRecommendation, detectInvestmentIntent } from '../src/rag/guardrails.js';
import { EDUCATIONAL_MODE_PREAMBLE, REINFORCED_RETRY_PREAMBLE } from '../src/rag/prompt.js';

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

describe('detectDirectRecommendation (E3.3 post-filter)', () => {
  const VIOLATIONS: Array<{ text: string; pattern: string }> = [
    { text: 'Compre Bitcoin agora — vai bombar.', pattern: 'imperative_asset' },
    { text: 'Venda dólar enquanto está alto.', pattern: 'imperative_asset' },
    { text: 'Invista em Tesouro IPCA para 2030.', pattern: 'imperative_asset' },
    { text: 'Aplique em FII de papel para renda mensal.', pattern: 'imperative_asset' },
    { text: 'Aporte em ETF do exterior todo mês.', pattern: 'imperative_asset' },
    { text: 'Aloque 30% em renda variável e 70% em renda fixa.', pattern: 'imperative_percent' },
    { text: 'Reserve 20% para criptomoedas.', pattern: 'imperative_percent' },
    { text: 'Recomendo comprar ações agora, antes da alta.', pattern: 'explicit_recommend' },
    { text: 'Sugiro investir em fundos imobiliários.', pattern: 'explicit_recommend' },
    { text: 'Aconselho comprar dólar como hedge.', pattern: 'explicit_recommend' },
    { text: 'Você deve comprar Bitcoin antes do halving.', pattern: 'you_should' },
    { text: 'Você deveria investir em FIIs.', pattern: 'you_should' },
    { text: 'Você precisa comprar dólar agora.', pattern: 'you_should' },
  ];

  for (const { text, pattern } of VIOLATIONS) {
    it(`flags "${text}" via ${pattern}`, () => {
      const d = detectDirectRecommendation(text);
      expect(d.violated).toBe(true);
      expect(d.matches).toContain(pattern);
    });
  }

  const SAFE_REPLIES = [
    // Educational paraphrases — must NOT trigger
    'Antes de decidir comprar qualquer ativo, considere seu horizonte e perfil de risco.',
    'O Fausto explica que para investir você deve primeiro entender quem ganha o quê no mercado.',
    'Eu devo comprar essa ideia? Essa é a pergunta que você deve se fazer antes de investir.',
    'A história mostra que períodos de alta volatilidade no Bitcoin antecedem correções.',
    'Conteúdo educativo; não é recomendação de investimento.',
    // The orchestrator-injected preambles use placeholder letters (X / Y / Z%)
    // so they must NOT trip the post-filter when echoed back by the LLM.
    EDUCATIONAL_MODE_PREAMBLE,
    REINFORCED_RETRY_PREAMBLE,
    // Empty / whitespace
    '',
    '   ',
  ];

  for (const text of SAFE_REPLIES) {
    it(`does NOT flag "${text.slice(0, 60).replace(/\n/g, ' ').trim() || '(vazio)'}"`, () => {
      const d = detectDirectRecommendation(text);
      expect(d.violated).toBe(false);
      expect(d.matches).toEqual([]);
    });
  }

  it('matches multiple patterns when the reply violates several rules at once', () => {
    const reply = [
      'Recomendo comprar Bitcoin agora.',
      'Compre dólar também.',
      'Aloque 30% em renda fixa.',
      'Você deve investir mais cedo.',
    ].join(' ');
    const d = detectDirectRecommendation(reply);
    expect(d.violated).toBe(true);
    expect(new Set(d.matches)).toEqual(
      new Set(['imperative_asset', 'imperative_percent', 'explicit_recommend', 'you_should']),
    );
  });

  it('normalises NFC — "ações" / "açao" forms', () => {
    expect(detectDirectRecommendation('Compre ações de tecnologia.').violated).toBe(true);
  });

  it('is pure / deterministic', () => {
    const t = 'Venda dólar hoje.';
    expect(detectDirectRecommendation(t)).toEqual(detectDirectRecommendation(t));
  });
});

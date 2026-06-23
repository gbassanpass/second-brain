import { describe, expect, it } from 'vitest';
import { FakeLLM } from '../src/llm/fake.js';
import { detectInvestmentIntent } from '../src/rag/guardrails.js';
import { type PersonaCard, personaCardSchema } from '../src/rag/persona.js';
import {
  EDUCATIONAL_MODE_PREAMBLE,
  buildLLMArgs,
  buildSystemPrompt,
  buildUserPrompt,
} from '../src/rag/prompt.js';

const FAUSTO: PersonaCard = personaCardSchema.parse({
  name: 'Fausto Bassan',
  one_liner: 'Explico o mundo sem torcer — política, ciência e fé.',
  voice: ['didático', 'direto', 'neutro/sem militância'],
  frameworks: ['quem ganha o quê', 'fatos vs narrativa'],
  do: ['explicar acontecimentos sem viés'],
  dont: ['recomendar compra/venda de ativos'],
  catchphrases: ['sem torcer'],
  disclaimer: 'Conteúdo educativo; não é recomendação de investimento.',
});

describe('buildSystemPrompt', () => {
  it('includes every Persona Card section', () => {
    const sys = buildSystemPrompt(FAUSTO);
    expect(sys).toContain('Fausto Bassan');
    expect(sys).toContain('Explico o mundo sem torcer');
    expect(sys).toContain('didático, direto, neutro/sem militância');
    expect(sys).toContain('quem ganha o quê; fatos vs narrativa');
    expect(sys).toContain('- explicar acontecimentos sem viés');
    expect(sys).toContain('- recomendar compra/venda de ativos');
    expect(sys).toContain('"não tenho isso registrado"');
    expect(sys).toContain('tom neutro e factual');
    expect(sys).toContain('mente digital');
    expect(sys).toContain('Disclaimer: Conteúdo educativo');
  });

  it('is byte-identical across calls (necessary for prompt caching)', () => {
    expect(buildSystemPrompt(FAUSTO)).toBe(buildSystemPrompt(FAUSTO));
  });

  it('omits the Disclaimer line when the card has none', () => {
    const noDisclaimer = personaCardSchema.parse({
      ...FAUSTO,
      disclaimer: undefined,
    });
    expect(buildSystemPrompt(noDisclaimer)).not.toContain('Disclaimer:');
  });

  it('falls back gracefully on empty optional arrays', () => {
    const sparse = personaCardSchema.parse({
      name: 'X',
      one_liner: 'y',
      voice: ['z'],
    });
    const sys = buildSystemPrompt(sparse);
    expect(sys).toContain('Frameworks que você usa ao explicar: (nenhum).');
    expect(sys).toContain('Você PODE:\n(nada explicitado)');
    expect(sys).toContain('Você NÃO PODE:\n(nada explicitado)');
  });
});

describe('buildUserPrompt', () => {
  it('numbers each chunk and ends with the question', () => {
    const out = buildUserPrompt({
      query: 'O que ele pensa sobre eleições?',
      chunks: [
        { text: 'Sobre eleições, o Fausto diz que…', title: 'Eleições 2026' },
        { text: 'Outro trecho relevante.' },
      ],
    });
    expect(out).toMatch(/\[1\] Eleições 2026\nSobre eleições/);
    expect(out).toMatch(/\[2\]\nOutro trecho relevante\./);
    expect(out).toMatch(/Pergunta: O que ele pensa sobre eleições\?$/);
  });

  it('renders an explicit empty list when no chunks are provided', () => {
    const out = buildUserPrompt({ query: 'pergunta solta', chunks: [] });
    expect(out).toContain('(nenhum trecho relevante encontrado)');
    expect(out).toContain('Pergunta: pergunta solta');
  });

  it('prepends EDUCATIONAL MODE preamble when guardrail flags investment', () => {
    const guardrail = detectInvestmentIntent('Que cripto eu devo comprar?');
    expect(guardrail.flag).toBe('investment');
    const out = buildUserPrompt({
      query: 'Que cripto eu devo comprar?',
      chunks: [{ text: 'algum contexto' }],
      guardrail,
    });
    expect(out.startsWith(EDUCATIONAL_MODE_PREAMBLE)).toBe(true);
    expect(out).toContain('MODO EDUCACIONAL OBRIGATÓRIO');
    expect(out).toContain('NUNCA recomende compra, venda ou alocação');
    expect(out).toContain('"Conteúdo educativo; não é recomendação de investimento."');
    // The chunks and the question still follow.
    expect(out).toContain('TRECHOS:');
    expect(out).toContain('Pergunta: Que cripto eu devo comprar?');
  });

  it('omits the preamble when guardrail is null or absent', () => {
    const withoutGuardrail = buildUserPrompt({
      query: 'O que ele pensa sobre eleições?',
      chunks: [{ text: 'sobre eleições' }],
    });
    expect(withoutGuardrail).not.toContain('MODO EDUCACIONAL');

    const nullGuardrail = buildUserPrompt({
      query: 'O que ele pensa sobre eleições?',
      chunks: [{ text: 'sobre eleições' }],
      guardrail: detectInvestmentIntent('O que ele pensa sobre eleições?'),
    });
    expect(nullGuardrail).not.toContain('MODO EDUCACIONAL');
  });
});

describe('buildLLMArgs', () => {
  it('forwards cacheSystemPrompt=true and embeds history before the user message', () => {
    const args = buildLLMArgs({
      personaCard: FAUSTO,
      query: 'qual o framework principal?',
      chunks: [{ text: 'Fausto: quem ganha o quê.' }],
      history: [
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'olá!' },
      ],
      model: 'claude-haiku',
    });
    expect(args.cacheSystemPrompt).toBe(true);
    expect(args.model).toBe('claude-haiku');
    expect(args.maxTokens).toBe(800);
    expect(args.messages).toHaveLength(3);
    expect(args.messages[0]).toEqual({ role: 'user', content: 'oi' });
    expect(args.messages[1]).toEqual({ role: 'assistant', content: 'olá!' });
    expect(args.messages[2]?.role).toBe('user');
    expect(args.messages[2]?.content).toContain('Pergunta: qual o framework principal?');
  });

  it('keeps the cached system block byte-identical across turns (cache friendliness)', async () => {
    const llm = new FakeLLM();
    await llm.complete(
      buildLLMArgs({
        personaCard: FAUSTO,
        query: 'pergunta A',
        chunks: [{ text: 'chunk A' }],
        model: 'claude-haiku',
      }),
    );
    await llm.complete(
      buildLLMArgs({
        personaCard: FAUSTO,
        query: 'pergunta B totalmente diferente',
        chunks: [{ text: 'chunk B', title: 'doc' }],
        model: 'claude-haiku',
      }),
    );
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0]?.cacheSystemPrompt).toBe(true);
    expect(llm.calls[1]?.cacheSystemPrompt).toBe(true);
    expect(llm.calls[0]?.system).toBe(llm.calls[1]?.system);
    // Per-turn pieces (user content) must differ.
    const userA = llm.calls[0]?.messages.at(-1)?.content ?? '';
    const userB = llm.calls[1]?.messages.at(-1)?.content ?? '';
    expect(userA).not.toBe(userB);
  });
});

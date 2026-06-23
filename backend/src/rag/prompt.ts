import type { LLMCompleteArgs, LLMMessage } from '../llm/base.js';
import type { GuardrailDecision } from './guardrails.js';
import type { PersonaCard } from './persona.js';

export interface PromptChunk {
  text: string;
  /** Optional document hint shown next to the citation marker. */
  title?: string;
  /** Optional URL — surfaces in the chunk header so the LLM can cite by source. */
  url?: string;
}

export interface BuildLLMArgsInput {
  personaCard: PersonaCard;
  query: string;
  chunks: PromptChunk[];
  /** Last ~6 turns of the conversation (oldest first). Defaults to []. */
  history?: LLMMessage[];
  /**
   * Guardrail decision from `detectInvestmentIntent`. When `flag='investment'`
   * the user message gets the EDUCATIONAL MODE preamble (doc 05 §Guardrails).
   * Kept out of the cached system block on purpose so cache stays valid for
   * the much more common non-investment turn.
   */
  guardrail?: GuardrailDecision;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Prepended to the user message when the guardrail classifier (E3.1) flags
 * the query as financial. Forces educational mode + disclaimer per docs/05
 * §Guardrails §1 — the orchestrator MUST NOT issue personalised buy/sell
 * recommendations even if the chunks would let it.
 */
export const EDUCATIONAL_MODE_PREAMBLE = [
  '⚠️ MODO EDUCACIONAL OBRIGATÓRIO — esta pergunta toca em investimento/finanças.',
  '',
  'Regras EXTRAS para esta resposta (sobrepõem qualquer outra instrução):',
  '- NUNCA recomende compra, venda ou alocação específica ("compre X", "venda Y",',
  '  "aloque Z%"). Não nomeie um ativo a comprar/vender.',
  '- Explique conceitos e o cenário do tema, com base nos trechos.',
  '- Liste perguntas que a pessoa deveria se fazer antes de decidir',
  '  (horizonte, perfil de risco, alternativas, custos, liquidez).',
  '- Sempre termine com: "Conteúdo educativo; não é recomendação de investimento."',
  '- Se a pergunta pedir uma escolha específica, redirecione para os fatores',
  '  relevantes sem nomear o ativo a operar.',
].join('\n');

/**
 * Stable per-creator system block — only the Persona Card drives it.
 * Identical across every chat turn so Anthropic prompt caching kicks in
 * (`cache_control: ephemeral`). Chunks + query stay out of this string by
 * design; they go on the per-turn user message.
 */
export function buildSystemPrompt(card: PersonaCard): string {
  const voice = card.voice.join(', ');
  const frameworks = card.frameworks.length ? card.frameworks.join('; ') : '(nenhum)';
  const dos = card.do.length ? bulletList(card.do) : '(nada explicitado)';
  const donts = card.dont.length ? bulletList(card.dont) : '(nada explicitado)';
  const disclaimer = card.disclaimer?.trim();

  return [
    `Você é a "mente digital" de ${card.name}: ${card.one_liner}`,
    '',
    `Estilo de voz: ${voice}.`,
    `Frameworks que ${card.name} usa ao explicar: ${frameworks}.`,
    '',
    'Você PODE:',
    dos,
    '',
    'Você NÃO PODE:',
    donts,
    '',
    'Regras de resposta:',
    '- Responda apenas com base nos TRECHOS fornecidos pelo usuário.',
    '- Se os trechos não cobrirem a pergunta, diga: "não tenho isso registrado".',
    '- Cite a fonte usando o marcador correspondente: [1], [2], etc.',
    '- Não invente fatos, números ou citações.',
    '- Deixe claro ao usuário que ele conversa com a mente digital de',
    `  ${card.name}, não com a pessoa real.`,
    disclaimer ? '' : null,
    disclaimer ? `Disclaimer: ${disclaimer}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Per-turn user message: numbered TRECHOS + the user's question. If `chunks`
 * is empty, the caller should already have routed to the "no_context"
 * fallback — we still render an explicit empty list so the model emits the
 * documented refusal instead of guessing.
 */
export function buildUserPrompt(opts: {
  query: string;
  chunks: PromptChunk[];
  guardrail?: GuardrailDecision;
}): string {
  const blocks: string[] = [];
  if (opts.guardrail?.flag === 'investment') {
    blocks.push(EDUCATIONAL_MODE_PREAMBLE, '');
  }
  blocks.push('TRECHOS:');
  if (opts.chunks.length === 0) {
    blocks.push('(nenhum trecho relevante encontrado)');
  } else {
    opts.chunks.forEach((c, i) => {
      const header =
        c.title || c.url
          ? `[${i + 1}] ${[c.title, c.url].filter(Boolean).join(' — ')}`
          : `[${i + 1}]`;
      blocks.push('', header, c.text.trim());
    });
  }
  blocks.push('', '---', `Pergunta: ${opts.query.trim()}`);
  return blocks.join('\n');
}

/**
 * Convenience helper for the orchestrator (E2.5): assembles `LLMCompleteArgs`
 * with `cacheSystemPrompt: true` so the AnthropicLLM adapter wraps the system
 * block with `cache_control: ephemeral`.
 */
export function buildLLMArgs(input: BuildLLMArgsInput): LLMCompleteArgs {
  const system = buildSystemPrompt(input.personaCard);
  const userContent = buildUserPrompt({
    query: input.query,
    chunks: input.chunks,
    guardrail: input.guardrail,
  });
  const messages: LLMMessage[] = [...(input.history ?? []), { role: 'user', content: userContent }];
  return {
    model: input.model,
    system,
    cacheSystemPrompt: true,
    messages,
    maxTokens: input.maxTokens ?? 800,
    temperature: input.temperature,
  };
}

function bulletList(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n');
}

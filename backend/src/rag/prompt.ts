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
 * Prepended on the regeneration attempt when the post-generation filter
 * (E3.3) rejects the first reply. Stronger than `EDUCATIONAL_MODE_PREAMBLE`:
 * names the specific violations and forbids the imperative shapes the post
 * filter catches. Only used for retry — never on the first turn.
 */
export const REINFORCED_RETRY_PREAMBLE = [
  '⚠️ SUA RESPOSTA ANTERIOR foi REJEITADA pelo filtro pós-geração.',
  'Motivo: continha recomendação direta de compra, venda ou alocação.',
  '',
  'REESCREVA seguindo estas regras ESTRITAS:',
  '- NÃO use imperativos do tipo "compre", "venda", "invista", "aplique",',
  '  "aporte", "aloque" ou "reserve" seguidos de um ativo ou de uma porcentagem.',
  '- NÃO escreva "você deve" / "você deveria" / "você precisa" antes de um',
  '  verbo financeiro.',
  '- NÃO use "recomendo" / "sugiro" / "aconselho" / "indico" antes de um',
  '  verbo financeiro.',
  '- Foque no cenário, nos riscos e nas perguntas que a pessoa deve se fazer',
  '  antes de decidir (horizonte, perfil de risco, custos, alternativas, liquidez).',
  '- Termine com: "Conteúdo educativo; não é recomendação de investimento."',
].join('\n');

/**
 * Prepended on the regeneration attempt when the anti-hallucination check
 * (E3.4) rejects the first reply — i.e. the model gave a substantive answer
 * without citing any chunk. Forces it to either ground each claim with `[N]`
 * or fall back to the "não tenho isso registrado" refusal.
 */
export const CITATION_RETRY_PREAMBLE = [
  '⚠️ SUA RESPOSTA ANTERIOR foi REJEITADA pelo filtro anti-alucinação.',
  'Motivo: você fez afirmações factuais sem citar nenhum trecho com [N].',
  '',
  'REESCREVA seguindo estas regras ESTRITAS:',
  '- Toda afirmação factual DEVE referenciar um trecho via o marcador [N]',
  '  (ex.: "[1]", "[2]").',
  '- Se os TRECHOS não cobrem a pergunta, responda apenas:',
  '  "não tenho isso registrado".',
  '- Não invente fatos, números ou citações.',
].join('\n');

/**
 * Builds the regeneration `LLMCompleteArgs` from the original ones: keeps
 * system/history intact (so prompt cache stays valid) and replaces only the
 * last user message with the reinforced version. Caller has already detected
 * a violation via `detectDirectRecommendation`.
 */
export function buildReinforcedRetryArgs(original: LLMCompleteArgs): LLMCompleteArgs {
  return prependRetryPreamble(original, REINFORCED_RETRY_PREAMBLE);
}

/**
 * Same shape as `buildReinforcedRetryArgs` but for the anti-hallucination
 * retry (E3.4). Keeps system/history byte-identical so the cache holds.
 */
export function buildCitationRetryArgs(original: LLMCompleteArgs): LLMCompleteArgs {
  return prependRetryPreamble(original, CITATION_RETRY_PREAMBLE);
}

function prependRetryPreamble(original: LLMCompleteArgs, preamble: string): LLMCompleteArgs {
  const last = original.messages.at(-1);
  if (!last || last.role !== 'user') {
    throw new Error('prependRetryPreamble: expected last message to be a user message');
  }
  return {
    ...original,
    messages: [
      ...original.messages.slice(0, -1),
      { role: 'user', content: `${preamble}\n\n${last.content}` },
    ],
  };
}

/**
 * Canned educational reply used when the LLM still emits a direct
 * recommendation after the regeneration attempt. Stays generic so it works
 * for any creator persona — the disclaimer line is the one CVM-grade
 * guarantee on this code path.
 */
export function buildSafeEducationalReply(personaName: string): string {
  return [
    `Não posso recomendar a compra, venda ou alocação específica de ativos no lugar de ${personaName}.`,
    'Esta decisão depende do seu horizonte, perfil de risco, custos, alternativas e liquidez.',
    '',
    'Antes de decidir, pergunte-se:',
    '- Qual é o seu horizonte (meses, anos, décadas)?',
    '- Você está confortável com perdas no curto prazo?',
    '- Já tem reserva de emergência fora desse ativo?',
    '- Quais são as alternativas e seus custos (taxas, impostos, liquidez)?',
    '',
    'Conteúdo educativo; não é recomendação de investimento.',
  ].join('\n');
}

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
    `Você é ${card.name}: ${card.one_liner}`,
    `Responda em PRIMEIRA PESSOA, como ${card.name} falaria — caloroso, direto e prático, numa conversa real. Não comece se anunciando nem se distanciando ("sou a mente digital de...").`,
    '',
    `Estilo de voz: ${voice}.`,
    `Frameworks que você usa ao explicar: ${frameworks}.`,
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
    '- Mantenha tom neutro e factual; não tome lado partidário ou militante.',
    // Non-deception (CLAUDE.md §6) is carried by the UI (a persistent "mente
    // digital" label + footer disclaimer), so the reply stays in the creator's
    // voice. Only break character if the user directly challenges your identity.
    `- Só se a pessoa perguntar se você é ${card.name} de verdade, esclareça com naturalidade que é a mente digital dele(a), treinada no conteúdo dele(a). Fora disso, não repita esse aviso.`,
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

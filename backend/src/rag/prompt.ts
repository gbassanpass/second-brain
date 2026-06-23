import type { LLMCompleteArgs, LLMMessage } from '../llm/base.js';
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
  model: string;
  maxTokens?: number;
  temperature?: number;
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
}): string {
  const blocks: string[] = ['TRECHOS:'];
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
  const userContent = buildUserPrompt({ query: input.query, chunks: input.chunks });
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

import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { documents } from '../db/schema.js';
import type { LLMClient } from '../llm/base.js';
import { type PersonaCard, personaCardSchema } from '../rag/persona.js';
import { setPersonaCard } from './persona.js';

/**
 * The CVM anti-investment guardrail (CLAUDE.md §1) must hold for EVERY clone,
 * so we force it into any auto-generated card regardless of what the LLM
 * returns. Same for the educational disclaimer.
 */
const REQUIRED_DONT = 'recomendar compra/venda de ativos ou dar conselho de investimento';
const REQUIRED_DISCLAIMER = 'Conteúdo educativo; não é recomendação de investimento.';

const MAX_DOCS = 15;
const MAX_CHARS = 6000;

export class PersonaGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonaGenError';
  }
}

function buildSystemPrompt(): string {
  return [
    'Você é um assistente que cria "Persona Cards" para clones de IA de criadores de conteúdo.',
    'A partir de amostras do conteúdo do criador, infira o estilo, os temas e o jeito de pensar dele.',
    'Responda APENAS com um objeto JSON válido (sem markdown, sem cercas de código), com EXATAMENTE estas chaves:',
    '{"name": string, "one_liner": string, "voice": string[], "frameworks": string[], "do": string[], "dont": string[], "catchphrases": string[], "disclaimer": string}',
    '- voice: 3-6 traços de tom/estilo (ex.: "didático", "direto").',
    '- frameworks: 2-4 lentes de análise recorrentes do criador.',
    '- do / dont: o que o clone deve e não deve fazer.',
    '- catchphrases: bordões reais que aparecem no conteúdo (pode ser vazio).',
    'Escreva em português. Seja fiel ao conteúdo; não invente fatos.',
  ].join('\n');
}

function buildUserPrompt(name: string, niche: string | null, sample: string): string {
  return [
    `Criador: ${name}${niche ? ` (nicho: ${niche})` : ''}`,
    '',
    'Amostras do conteúdo dele:',
    '"""',
    sample,
    '"""',
    '',
    'Gere o Persona Card em JSON.',
  ].join('\n');
}

/** Strip code fences and grab the outermost JSON object. */
function extractJson(content: string): unknown {
  const fenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new PersonaGenError('LLM did not return a JSON object');
  }
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch (err) {
    throw new PersonaGenError(`LLM JSON parse failed: ${(err as Error).message}`);
  }
}

/** Force the non-negotiable guardrail bits onto whatever the LLM produced. */
function withGuardrails(card: PersonaCard): PersonaCard {
  const dont = card.dont.some((d) => /investa|investimento|ativos|compra\/venda/i.test(d))
    ? card.dont
    : [...card.dont, REQUIRED_DONT];
  // The disclaimer field doubles as the public educational notice (landing).
  // Keep the LLM's only if it already carries the CVM caveat; else force ours.
  const llmDisclaimer = card.disclaimer?.trim() ?? '';
  const disclaimer = /investimento|investir|ativos|cvm/i.test(llmDisclaimer)
    ? llmDisclaimer
    : REQUIRED_DISCLAIMER;
  return { ...card, dont, disclaimer };
}

export interface GeneratePersonaInput {
  creatorId: string;
  slug: string;
  displayName: string;
  niche?: string | null;
  model: string;
  maxTokens?: number;
}

/**
 * Generate + persist a Persona Card from the creator's indexed content (F1.x).
 * Samples recent documents, asks the LLM for a structured card, validates it
 * with the Zod schema (one retry), and forces the CVM guardrail in. Throws
 * `PersonaGenError` if the creator has no content or the LLM never returns a
 * valid card.
 */
export async function generatePersonaCard(
  db: Database,
  llm: LLMClient,
  input: GeneratePersonaInput,
): Promise<PersonaCard> {
  const docs = await db
    .select({ rawText: documents.rawText })
    .from(documents)
    .where(eq(documents.creatorId, input.creatorId))
    .orderBy(desc(documents.createdAt))
    .limit(MAX_DOCS);

  const sample = docs
    .map((d) => d.rawText)
    .join('\n\n---\n\n')
    .slice(0, MAX_CHARS);
  if (sample.trim().length === 0) {
    throw new PersonaGenError('creator has no content to learn from');
  }

  const system = buildSystemPrompt();
  const baseUser = buildUserPrompt(input.displayName, input.niche ?? null, sample);

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nATENÇÃO: responda SOMENTE com o JSON válido, sem texto extra.`;
    const result = await llm.complete({
      model: input.model,
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: input.maxTokens ?? 700,
      temperature: 0.4,
    });
    try {
      const parsed = personaCardSchema.safeParse(extractJson(result.content));
      if (parsed.success) {
        const card = withGuardrails({ ...parsed.data, name: input.displayName });
        const saved = await setPersonaCard(db, input.slug, card);
        if ('error' in saved) throw new PersonaGenError('creator_not_found');
        return saved.card;
      }
      lastErr = new PersonaGenError(`invalid persona card: ${parsed.error.message}`);
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new PersonaGenError('failed to generate persona');
}

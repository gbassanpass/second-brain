import { z } from 'zod';
import type { LLMClient } from '../llm/base.js';

/**
 * Knowledge-graph extraction (F1.5.1, doc 10 §GraphRAG). An LLM reads a chunk
 * of the creator's content and pulls out (a) entities, (b) relations between
 * them, and crucially (c) the creator's **principles/heuristics** — HOW they
 * reason, not just what they said. Each relation carries a `confidence`.
 */
export const ENTITY_KINDS = ['pessoa', 'tema', 'principio', 'evento', 'heuristica'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

const extractedSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        kind: z.enum(ENTITY_KINDS).catch('tema'),
      }),
    )
    .max(40),
  relations: z
    .array(
      z.object({
        src: z.string().trim().min(1).max(120),
        relation: z.string().trim().min(1).max(60),
        dst: z.string().trim().min(1).max(120),
        confidence: z.number().min(0).max(1).catch(0.7),
      }),
    )
    .max(60),
});

export type ExtractedGraph = z.infer<typeof extractedSchema>;

export class KgExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KgExtractError';
  }
}

function buildSystemPrompt(): string {
  return [
    'Você extrai um grafo de conhecimento do conteúdo de um criador para um clone de IA.',
    'A partir do trecho, identifique:',
    '- entities: entidades citadas, cada uma com um "kind" entre: pessoa, tema, principio, evento, heuristica.',
    '  Capture especialmente PRINCÍPIOS e HEURÍSTICAS — como o criador pensa/decide, não só fatos.',
    '- relations: triplas (src, relation, dst) ligando entidades, com "confidence" em [0,1]',
    '  = quão provável é que o criador realmente sustentaria essa relação.',
    '  Use relações como "acredita_que", "decide_por", "relaciona", "critica", "valoriza".',
    'Responda APENAS com JSON válido (sem markdown, sem cercas), no formato EXATO:',
    '{"entities":[{"name":string,"kind":string}],"relations":[{"src":string,"relation":string,"dst":string,"confidence":number}]}',
    'src e dst devem referenciar nomes que aparecem em entities. Não invente fatos. Em português.',
    'Se o trecho não tiver nada relevante, retorne {"entities":[],"relations":[]}.',
  ].join('\n');
}

function buildUserPrompt(creatorName: string, text: string): string {
  return [
    `Criador: ${creatorName}`,
    '',
    'Trecho:',
    '"""',
    text,
    '"""',
    '',
    'Extraia o grafo em JSON.',
  ].join('\n');
}

function extractJson(content: string): unknown {
  const fenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new KgExtractError('LLM did not return a JSON object');
  }
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch (err) {
    throw new KgExtractError(`LLM JSON parse failed: ${(err as Error).message}`);
  }
}

export interface ExtractGraphInput {
  creatorName: string;
  text: string;
  model: string;
  maxTokens?: number;
}

/**
 * Run one extraction over a chunk of text. Relations whose src/dst aren't in
 * `entities` are kept — the caller materializes missing endpoints as `tema`.
 */
export async function extractGraphFromText(
  llm: LLMClient,
  input: ExtractGraphInput,
): Promise<ExtractedGraph> {
  const result = await llm.complete({
    model: input.model,
    system: buildSystemPrompt(),
    cacheSystemPrompt: true,
    messages: [{ role: 'user', content: buildUserPrompt(input.creatorName, input.text) }],
    maxTokens: input.maxTokens ?? 800,
    temperature: 0,
  });

  const parsed = extractedSchema.safeParse(extractJson(result.content));
  if (!parsed.success) {
    throw new KgExtractError(`extracted graph failed validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

import { z } from 'zod';
import type { LLMClient } from '../llm/base.js';

export interface ChunkEnrichment {
  /** One-sentence summary of the chunk (embedded as its own row). */
  summary: string;
  /** 3-5 hypothetical questions this chunk answers (each embedded). */
  questions: string[];
}

const enrichmentSchema = z.object({
  summary: z.string().min(3).max(400),
  questions: z.array(z.string().min(5).max(200)).min(1).max(6),
});

/**
 * Enrichment pipeline (F1.8, Delphi-style). For one chunk, the LLM produces a
 * short summary + a few hypothetical questions the chunk answers. Indexing these
 * alongside the raw text (each as its own embedded row) lifts recall: a user
 * question matches the embedded *question*, which resolves back to the raw chunk.
 *
 * Returns null on failure (best-effort — never blocks indexing).
 */
export async function enrichChunk(
  llm: LLMClient,
  input: { text: string; model: string },
): Promise<ChunkEnrichment | null> {
  const text = input.text.trim();
  if (text.length < 40) return null; // too short to enrich meaningfully

  try {
    const res = await llm.complete({
      model: input.model,
      system:
        'Você indexa conteúdo para busca semântica. Dado um trecho, gere um ' +
        'resumo e perguntas que ele responde. Responda APENAS com JSON válido.',
      messages: [
        {
          role: 'user',
          content: [
            'Trecho:',
            '"""',
            text.slice(0, 4000),
            '"""',
            '',
            'Gere um objeto JSON com:',
            '- "summary": uma frase curta resumindo o trecho.',
            '- "questions": 3 a 5 perguntas naturais que ALGUÉM faria e que este',
            '  trecho responde (variadas, específicas, sem repetir o resumo).',
            'Não invente fatos fora do trecho. Responda só o JSON.',
          ].join('\n'),
        },
      ],
      maxTokens: 400,
    });
    return parseEnrichment(res.content);
  } catch {
    return null;
  }
}

function parseEnrichment(raw: string): ChunkEnrichment | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = enrichmentSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

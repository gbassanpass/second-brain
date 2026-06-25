import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { creators, kgEntities, kgRelations } from '../db/schema.js';
import type { LLMClient } from '../llm/base.js';

/** Entity kinds worth turning into starter questions (topics the creator covers). */
const THEME_KINDS = ['tema', 'principio', 'heuristica', 'evento'];
const MAX_QUESTIONS = 5;

const questionsSchema = z.array(z.string().min(3).max(160)).max(12);

/**
 * Top themes the creator actually talks about, by graph "degree" (how many
 * relations touch the entity). Cheap signal for what to suggest asking about.
 */
async function topThemes(db: Database, creatorId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({
      name: kgEntities.name,
      degree: sql<number>`count(${kgRelations.id})`,
    })
    .from(kgEntities)
    .leftJoin(
      kgRelations,
      or(eq(kgRelations.srcId, kgEntities.id), eq(kgRelations.dstId, kgEntities.id)),
    )
    .where(and(eq(kgEntities.creatorId, creatorId), inArray(kgEntities.kind, THEME_KINDS)))
    .groupBy(kgEntities.id, kgEntities.name)
    .orderBy(desc(sql`count(${kgRelations.id})`))
    .limit(limit);
  return rows.map((r) => r.name);
}

/**
 * Generate starter questions from the creator's graph and CACHE them on the
 * creators row (F1.20). Runs in the background kg-build job, so the chat
 * empty-state reads a ready list without paying an LLM call per visit. Returns
 * the questions (empty if the graph has no themes yet).
 */
export async function generateSuggestedQuestions(
  db: Database,
  llm: LLMClient,
  input: { creatorId: string; creatorName: string; model: string },
): Promise<string[]> {
  const themes = await topThemes(db, input.creatorId, 12);
  if (themes.length === 0) return [];

  const res = await llm.complete({
    model: input.model,
    system:
      'Você gera perguntas de partida para uma audiência conversar com a mente ' +
      'digital de um criador. Responda APENAS com um array JSON de strings.',
    messages: [
      {
        role: 'user',
        content: [
          `Criador: ${input.creatorName}.`,
          `Temas que ele(a) aborda: ${themes.join(', ')}.`,
          '',
          `Gere ${MAX_QUESTIONS} perguntas curtas (máx. ~12 palavras), naturais e`,
          'específicas, que um seguidor faria para ouvir a OPINIÃO/ANÁLISE dele(a)',
          'sobre esses temas. Variadas, em 1ª pessoa do seguidor, sem numeração.',
          'Responda só o array JSON, ex.: ["...", "..."].',
        ].join('\n'),
      },
    ],
    maxTokens: 300,
  });

  const parsed = parseQuestions(res.content);
  const questions = parsed.slice(0, MAX_QUESTIONS);
  await db
    .update(creators)
    .set({ suggestedQuestions: questions })
    .where(eq(creators.id, input.creatorId));
  return questions;
}

/** Read the cached suggested questions (public-safe; no LLM call). */
export async function getSuggestedQuestions(db: Database, creatorId: string): Promise<string[]> {
  const [row] = await db
    .select({ q: creators.suggestedQuestions })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  const parsed = questionsSchema.safeParse(row?.q);
  return parsed.success ? parsed.data.slice(0, MAX_QUESTIONS) : [];
}

/** Tolerant parse: accept a JSON array, or fall back to non-empty lines. */
function parseQuestions(raw: string): string[] {
  const text = raw.trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = questionsSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
      if (arr.success) return arr.data;
    } catch {
      // fall through to line parsing
    }
  }
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/^[\s\-*\d.)"']+/, '')
        .replace(/["']+$/, '')
        .trim(),
    )
    .filter((l) => l.length >= 3 && l.length <= 160);
}

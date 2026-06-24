import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { contentIdeas, creators } from '../db/schema.js';
import type { LLMClient } from '../llm/base.js';
import { getCreatorAnalytics } from './analytics.js';

/**
 * Content intelligence (best-in-class Insights): turn real audience demand —
 * top questions + the questions the clone couldn't answer (content gaps) — into
 * concrete, PERSISTED content ideas. Each idea records WHY it was suggested
 * (the audience question) and can generate a full script on demand. This is the
 * "why an influencer pays": the platform tells them what to make and how.
 */
export interface ContentIdeaView {
  id: string;
  title: string;
  angle: string;
  basedOn: 'demanda' | 'lacuna';
  sourceQuestion: string | null;
  /** Generated roteiro (markdown), null until the creator opens the idea. */
  script: string | null;
  createdAt: string;
}

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(140),
        angle: z.string().trim().min(1).max(400),
        basedOn: z.enum(['demanda', 'lacuna']).catch('demanda'),
        sourceQuestion: z.string().trim().max(400).optional(),
      }),
    )
    .max(8),
});

export class ContentIdeasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentIdeasError';
  }
}

function extractJson(content: string): unknown {
  const fenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1) throw new ContentIdeasError('LLM did not return JSON');
  return JSON.parse(fenced.slice(start, end + 1));
}

function toView(row: typeof contentIdeas.$inferSelect): ContentIdeaView {
  return {
    id: row.id,
    title: row.title,
    angle: row.angle,
    basedOn: row.basedOn === 'lacuna' ? 'lacuna' : 'demanda',
    sourceQuestion: row.sourceQuestion,
    script: row.script,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listContentIdeas(
  db: Database,
  creatorId: string,
): Promise<ContentIdeaView[]> {
  const rows = await db
    .select()
    .from(contentIdeas)
    .where(eq(contentIdeas.creatorId, creatorId))
    .orderBy(desc(contentIdeas.createdAt));
  return rows.map(toView);
}

/**
 * Generate fresh ideas from current demand + gaps and persist them (dedupe by
 * title). Returns the full, updated list (newest first).
 */
export async function generateContentIdeas(
  db: Database,
  llm: LLMClient,
  input: { creatorId: string; model: string },
): Promise<ContentIdeaView[]> {
  const analytics = await getCreatorAnalytics(db, input.creatorId, { topN: 10 });
  const top = analytics.topQuestions;
  const gaps = analytics.contentGaps;
  if (top.length === 0 && gaps.length === 0) return listContentIdeas(db, input.creatorId);

  const [creator] = await db
    .select({ displayName: creators.displayName, niche: creators.niche })
    .from(creators)
    .where(eq(creators.id, input.creatorId))
    .limit(1);
  const name = creator?.displayName ?? 'o criador';
  const niche = creator?.niche ?? '';

  const system = [
    'Você é um estrategista de conteúdo para criadores.',
    'A partir do que a AUDIÊNCIA perguntou ao clone de IA do criador, proponha pautas',
    'de conteúdo (vídeos/posts) que o criador deveria produzir.',
    'Priorize LACUNAS (perguntas que o clone não soube responder) e DEMANDA (frequentes).',
    'Responda APENAS com JSON válido, EXATO:',
    '{"ideas":[{"title":string,"angle":string,"basedOn":"demanda"|"lacuna","sourceQuestion":string}]}',
    '- title: título curto e chamativo da pauta.',
    '- angle: 1-2 frases com o ângulo/abordagem, no tom do criador.',
    '- basedOn: "lacuna" se vem de pergunta não respondida, senão "demanda".',
    '- sourceQuestion: a pergunta da audiência que motivou a pauta (copie do material).',
    'Máx. 6 ideias. Em português. Não invente temas fora do que foi perguntado.',
  ].join('\n');

  const user = [
    `Criador: ${name}${niche ? ` (nicho: ${niche})` : ''}`,
    '',
    'Perguntas mais frequentes da audiência:',
    top.length ? top.map((q) => `- (${q.count}x) ${q.question}`).join('\n') : '- (nenhuma)',
    '',
    'Perguntas que o clone NÃO soube responder (lacunas de conteúdo):',
    gaps.length ? gaps.map((q) => `- (${q.count}x) ${q.question}`).join('\n') : '- (nenhuma)',
    '',
    'Gere as pautas em JSON.',
  ].join('\n');

  const res = await llm.complete({
    model: input.model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 800,
    temperature: 0.4,
  });

  const parsed = ideasSchema.safeParse(extractJson(res.content));
  if (!parsed.success) throw new ContentIdeasError('ideas failed validation');

  if (parsed.data.ideas.length > 0) {
    await db
      .insert(contentIdeas)
      .values(
        parsed.data.ideas.map((i) => ({
          creatorId: input.creatorId,
          title: i.title,
          angle: i.angle,
          basedOn: i.basedOn,
          sourceQuestion: i.sourceQuestion ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  return listContentIdeas(db, input.creatorId);
}

/**
 * Generate (and cache) a full content script for one idea, in the creator's
 * voice. Returns the updated idea, or null if it isn't theirs.
 */
export async function generateIdeaScript(
  db: Database,
  llm: LLMClient,
  input: { creatorId: string; ideaId: string; model: string; force?: boolean },
): Promise<ContentIdeaView | null> {
  const [idea] = await db
    .select()
    .from(contentIdeas)
    .where(
      sql`${contentIdeas.id} = ${input.ideaId} and ${contentIdeas.creatorId} = ${input.creatorId}`,
    )
    .limit(1);
  if (!idea) return null;
  if (idea.script && !input.force) return toView(idea);

  const [creator] = await db
    .select({ displayName: creators.displayName, niche: creators.niche })
    .from(creators)
    .where(eq(creators.id, input.creatorId))
    .limit(1);
  const name = creator?.displayName ?? 'o criador';
  const niche = creator?.niche ?? '';

  const system = [
    `Você é roteirista de conteúdo de ${name}${niche ? ` (nicho: ${niche})` : ''}.`,
    'Escreva um ROTEIRO pronto para gravar, na voz do criador, em MARKDOWN, com:',
    '- **Gancho** (primeiros 5s, frase de abertura forte).',
    '- **Desenvolvimento** (3 a 5 pontos/blocos com o que falar em cada um).',
    '- **Encerramento + CTA**.',
    'Seja concreto e fiel ao tema. Não invente dados/estatísticas específicas.',
    'Se tocar em investimento, mantenha educacional, sem recomendar compra/venda.',
  ].join('\n');

  const user = [
    `Pauta: ${idea.title}`,
    `Ângulo: ${idea.angle}`,
    idea.sourceQuestion ? `Pergunta da audiência que motivou: "${idea.sourceQuestion}"` : '',
    '',
    'Escreva o roteiro em markdown.',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await llm.complete({
    model: input.model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 900,
    temperature: 0.5,
  });

  const script = res.content.trim();
  const [updated] = await db
    .update(contentIdeas)
    .set({ script })
    .where(eq(contentIdeas.id, idea.id))
    .returning();
  return updated ? toView(updated) : null;
}

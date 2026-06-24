import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { creators } from '../db/schema.js';
import type { LLMClient } from '../llm/base.js';
import { getCreatorAnalytics } from './analytics.js';

/**
 * Content intelligence (best-in-class Insights): turn real audience demand —
 * top questions + the questions the clone couldn't answer (content gaps) — into
 * concrete content ideas the creator should produce. This is the "why an
 * influencer pays": the platform tells them what to make next.
 */
export interface ContentIdea {
  title: string;
  angle: string;
  /** Why it's suggested: 'demanda' (asked a lot) or 'lacuna' (asked, unanswered). */
  basedOn: 'demanda' | 'lacuna';
}

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(140),
        angle: z.string().trim().min(1).max(400),
        basedOn: z.enum(['demanda', 'lacuna']).catch('demanda'),
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

export async function generateContentIdeas(
  db: Database,
  llm: LLMClient,
  input: { creatorId: string; model: string },
): Promise<ContentIdea[]> {
  const analytics = await getCreatorAnalytics(db, input.creatorId, { topN: 10 });
  const top = analytics.topQuestions;
  const gaps = analytics.contentGaps;
  // Nothing to suggest from yet.
  if (top.length === 0 && gaps.length === 0) return [];

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
    'Priorize: (1) LACUNAS (perguntas que o clone não soube responder — demanda não atendida),',
    '(2) DEMANDA (perguntas mais frequentes).',
    'Responda APENAS com JSON válido, EXATO:',
    '{"ideas":[{"title":string,"angle":string,"basedOn":"demanda"|"lacuna"}]}',
    '- title: título curto e chamativo da pauta.',
    '- angle: 1-2 frases com o ângulo/abordagem, no tom do criador.',
    '- basedOn: "lacuna" se vem de pergunta não respondida, senão "demanda".',
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
    maxTokens: 700,
    temperature: 0.4,
  });

  const parsed = ideasSchema.safeParse(extractJson(res.content));
  if (!parsed.success) throw new ContentIdeasError('ideas failed validation');
  return parsed.data.ideas;
}

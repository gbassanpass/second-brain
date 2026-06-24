import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators, documents, messages } from '../db/schema.js';

/**
 * Mind Score (F1.14) — a real coverage/maturity metric for a clone, derived
 * from data (no vanity number). It rewards the things that actually make the
 * clone answer well:
 *   - a defined persona (foundation),
 *   - knowledge volume (retrievable chunks) and diversity (documents),
 *   - training depth (Q&A corrections the creator taught),
 *   - answer confidence (share of answers that found context vs "não tenho isso
 *     registrado").
 * The biggest missing piece becomes a concrete next-step nudge.
 */
export type MindLevel = 'iniciante' | 'aprendiz' | 'experiente' | 'mestre';

export interface MindScoreComponent {
  /** Points earned for this dimension. */
  points: number;
  /** Max points this dimension can contribute. */
  max: number;
}

export interface MindScore {
  score: number; // 0–100
  level: MindLevel;
  components: {
    persona: MindScoreComponent & { present: boolean };
    knowledge: MindScoreComponent & { chunks: number; documents: number };
    training: MindScoreComponent & { corrections: number };
    confidence: MindScoreComponent & { answered: number; answers: number; rate: number };
  };
  /** The single most impactful thing to do next. */
  nextStep: string;
}

// Targets at which a dimension is "full". Tuned for an MVP clone — reaching
// these is enough to answer most audience questions well.
const TARGETS = { chunks: 50, documents: 20, corrections: 10 } as const;
const MAX = { persona: 15, knowledge: 50, training: 15, confidence: 20 } as const;
// Knowledge splits its 50 between volume (chunks) and diversity (documents).
const KNOWLEDGE_SPLIT = { chunks: 35, documents: 15 } as const;

function ramp(value: number, target: number, maxPoints: number): number {
  return Math.min(maxPoints, Math.round((maxPoints * Math.min(value, target)) / target));
}

export async function getMindScore(db: Database, creatorId: string): Promise<MindScore> {
  const [creator] = await db
    .select({ persona: creators.personaCard })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  // Knowledge: chunk count via documents' chunks, document & Q&A counts.
  const [docAgg] = await db
    .select({
      documents: count(),
      corrections: sql<number>`count(*) filter (where ${documents.kind} = 'qa')`,
    })
    .from(documents)
    .where(eq(documents.creatorId, creatorId));

  const [chunkAgg] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from chunks where creator_id = ${creatorId}`,
  );

  const [answerAgg] = await db
    .select({
      answers: sql<number>`count(*) filter (where ${messages.role} = 'assistant')`,
      answered: sql<number>`count(*) filter (where ${messages.role} = 'assistant' and ${messages.retrievedChunks} is not null)`,
    })
    .from(messages)
    .where(and(eq(messages.creatorId, creatorId), isNotNull(messages.id)));

  const personaPresent = creator?.persona != null;
  const chunks = Number(chunkAgg?.n ?? 0);
  const docs = Number(docAgg?.documents ?? 0);
  const corrections = Number(docAgg?.corrections ?? 0);
  const answers = Number(answerAgg?.answers ?? 0);
  const answered = Number(answerAgg?.answered ?? 0);
  const rate = answers > 0 ? answered / answers : 0;

  const personaPoints = personaPresent ? MAX.persona : 0;
  const knowledgePoints =
    ramp(chunks, TARGETS.chunks, KNOWLEDGE_SPLIT.chunks) +
    ramp(docs, TARGETS.documents, KNOWLEDGE_SPLIT.documents);
  const trainingPoints = ramp(corrections, TARGETS.corrections, MAX.training);
  // Confidence only counts once the clone has actually answered.
  const confidencePoints = answers > 0 ? Math.round(MAX.confidence * rate) : 0;

  const score = Math.min(100, personaPoints + knowledgePoints + trainingPoints + confidencePoints);

  return {
    score,
    level: levelFor(score),
    components: {
      persona: { present: personaPresent, points: personaPoints, max: MAX.persona },
      knowledge: { chunks, documents: docs, points: knowledgePoints, max: MAX.knowledge },
      training: { corrections, points: trainingPoints, max: MAX.training },
      confidence: { answered, answers, rate, points: confidencePoints, max: MAX.confidence },
    },
    nextStep: nextStep({
      personaPresent,
      personaGap: MAX.persona - personaPoints,
      knowledgeGap: MAX.knowledge - knowledgePoints,
      trainingGap: MAX.training - trainingPoints,
      confidenceGap: answers > 0 ? MAX.confidence - confidencePoints : 0,
      answers,
      rate,
    }),
  };
}

function levelFor(score: number): MindLevel {
  if (score >= 80) return 'mestre';
  if (score >= 55) return 'experiente';
  if (score >= 30) return 'aprendiz';
  return 'iniciante';
}

function nextStep(g: {
  personaPresent: boolean;
  personaGap: number;
  knowledgeGap: number;
  trainingGap: number;
  confidenceGap: number;
  answers: number;
  rate: number;
}): string {
  // Persona is the foundation — always fix it first if missing.
  if (!g.personaPresent) {
    return 'Defina a persona do seu clone em Persona — é a base de tudo.';
  }
  const biggest = Math.max(g.knowledgeGap, g.trainingGap, g.confidenceGap);
  if (biggest <= 0) return 'Sua mente está completa. Continue treinando para manter a fidelidade.';
  if (biggest === g.knowledgeGap) {
    return 'Adicione mais conteúdo em Conhecimento (importe posts ou use Adicionar conhecimento).';
  }
  if (biggest === g.confidenceGap && g.answers > 0) {
    const missPct = Math.round((1 - g.rate) * 100);
    return `${missPct}% das respostas ficaram sem contexto — adicione conteúdo sobre esses temas ou ensine no Treinar.`;
  }
  return 'Ensine respostas no Treinar para subir a fidelidade do clone.';
}

import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { conversations, messages } from '../db/schema.js';

export interface TopQuestion {
  question: string;
  count: number;
}

/** A day on the activity timeline. */
export interface DailyPoint {
  date: string; // YYYY-MM-DD
  conversations: number;
  messages: number;
}

/**
 * A question the audience asked that the clone COULDN'T answer ("não tenho isso
 * registrado"). These are content opportunities — the creator should make
 * content about them.
 */
export interface ContentGap {
  question: string;
  count: number;
}

export interface CreatorAnalytics {
  conversations: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalCostUsd: number;
  /** Mean cost per assistant turn (the billable unit). 0 when none yet. */
  avgCostUsdPerAnswer: number;
  avgLatencyMs: number | null;
  guardrailInvestmentCount: number;
  /** investment-flagged ÷ assistant turns, in [0,1]. 0 when none yet. */
  guardrailRate: number;
  topQuestions: TopQuestion[];
  /** Daily activity for the last N days (oldest first), gaps filled with 0. */
  dailyActivity: DailyPoint[];
  /** Questions the clone failed to answer → content opportunities. */
  contentGaps: ContentGap[];
  /** Share of answers that found context (1 - no_context rate), in [0,1]. */
  answerRate: number;
}

/**
 * Creator-scoped analytics for the Studio (E6.5), derived entirely from the
 * `messages` audit log + `conversations`. Cost/latency/guardrail live on the
 * assistant turns; `topQuestions` groups the user turns by content.
 */
export async function getCreatorAnalytics(
  db: Database,
  creatorId: string,
  opts: { topN?: number; days?: number } = {},
): Promise<CreatorAnalytics> {
  const topN = opts.topN ?? 5;

  const [convRow] = await db
    .select({ value: count() })
    .from(conversations)
    .where(eq(conversations.creatorId, creatorId));

  const [agg] = await db
    .select({
      total: count(),
      userCount: sql<number>`count(*) filter (where ${messages.role} = 'user')`,
      assistantCount: sql<number>`count(*) filter (where ${messages.role} = 'assistant')`,
      totalCost: sql<string>`coalesce(sum(${messages.costUsd}), 0)`,
      avgLatency: sql<
        string | null
      >`avg(${messages.latencyMs}) filter (where ${messages.role} = 'assistant')`,
      guardrail: sql<number>`count(*) filter (where ${messages.guardrailFlag} = 'investment')`,
      noContext: sql<number>`count(*) filter (where ${messages.role} = 'assistant' and ${messages.retrievedChunks} is null and ${messages.content} ilike 'Não tenho isso registrado%')`,
    })
    .from(messages)
    .where(eq(messages.creatorId, creatorId));

  const top = await db
    .select({ question: messages.content, value: count() })
    .from(messages)
    .where(and(eq(messages.creatorId, creatorId), eq(messages.role, 'user')))
    .groupBy(messages.content)
    .orderBy(desc(count()))
    .limit(topN);

  const assistantMessages = Number(agg?.assistantCount ?? 0);
  const totalCostUsd = Number(agg?.totalCost ?? 0);
  const guardrail = Number(agg?.guardrail ?? 0);
  const avgLatency = agg?.avgLatency != null ? Math.round(Number(agg.avgLatency)) : null;

  const days = opts.days ?? 30;

  // Daily activity (conversations + messages per day) for the window.
  const activityRows = (await db.execute(sql`
    WITH span AS (
      SELECT generate_series(
        (current_date - make_interval(days => ${days - 1})),
        current_date,
        interval '1 day'
      )::date AS day
    ),
    msgs AS (
      SELECT created_at::date AS day, count(*) AS n
      FROM messages
      WHERE creator_id = ${creatorId}::uuid
        AND created_at >= current_date - make_interval(days => ${days - 1})
      GROUP BY 1
    ),
    convs AS (
      SELECT created_at::date AS day, count(*) AS n
      FROM conversations
      WHERE creator_id = ${creatorId}::uuid
        AND created_at >= current_date - make_interval(days => ${days - 1})
      GROUP BY 1
    )
    SELECT to_char(span.day, 'YYYY-MM-DD') AS date,
           COALESCE(convs.n, 0) AS conversations,
           COALESCE(msgs.n, 0) AS messages
    FROM span
    LEFT JOIN msgs ON msgs.day = span.day
    LEFT JOIN convs ON convs.day = span.day
    ORDER BY span.day
  `)) as unknown as { date: string; conversations: string | number; messages: string | number }[];

  // Content gaps: questions whose answer was the "não tenho isso registrado"
  // refusal — i.e. the user asked something the clone has no content for.
  const noContext = Number(agg?.noContext ?? 0);
  const gapRows = (await db.execute(sql`
    SELECT u.content AS question, count(*) AS n
    FROM messages a
    JOIN LATERAL (
      SELECT content FROM messages u
      WHERE u.conversation_id = a.conversation_id
        AND u.role = 'user' AND u.created_at < a.created_at
      ORDER BY u.created_at DESC LIMIT 1
    ) u ON true
    WHERE a.creator_id = ${creatorId}::uuid
      AND a.role = 'assistant'
      AND a.retrieved_chunks IS NULL
      AND a.content ILIKE 'Não tenho isso registrado%'
    GROUP BY u.content
    ORDER BY n DESC
    LIMIT ${topN}
  `)) as unknown as { question: string; n: string | number }[];

  return {
    conversations: Number(convRow?.value ?? 0),
    totalMessages: Number(agg?.total ?? 0),
    userMessages: Number(agg?.userCount ?? 0),
    assistantMessages,
    totalCostUsd,
    avgCostUsdPerAnswer: assistantMessages > 0 ? totalCostUsd / assistantMessages : 0,
    avgLatencyMs: avgLatency,
    guardrailInvestmentCount: guardrail,
    guardrailRate: assistantMessages > 0 ? guardrail / assistantMessages : 0,
    topQuestions: top.map((t) => ({ question: t.question, count: Number(t.value) })),
    dailyActivity: activityRows.map((r) => ({
      date: r.date,
      conversations: Number(r.conversations),
      messages: Number(r.messages),
    })),
    contentGaps: gapRows.map((r) => ({ question: r.question, count: Number(r.n) })),
    answerRate: assistantMessages > 0 ? (assistantMessages - noContext) / assistantMessages : 0,
  };
}

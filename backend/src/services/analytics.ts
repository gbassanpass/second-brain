import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { conversations, messages } from '../db/schema.js';

export interface TopQuestion {
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
}

/**
 * Creator-scoped analytics for the Studio (E6.5), derived entirely from the
 * `messages` audit log + `conversations`. Cost/latency/guardrail live on the
 * assistant turns; `topQuestions` groups the user turns by content.
 */
export async function getCreatorAnalytics(
  db: Database,
  creatorId: string,
  opts: { topN?: number } = {},
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
  };
}

import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { conversations, messages } from '../db/schema.js';

export interface ConversationSummary {
  id: string;
  /** First user question — used as the title, like Delphi. */
  firstQuestion: string | null;
  messageCount: number;
  lastActivity: string | null;
  createdAt: string;
}

/** Conversations the audience had with a creator's clone, newest activity first (F1.13). */
export async function listConversations(
  db: Database,
  creatorId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      createdAt: conversations.createdAt,
      messageCount: sql<number>`count(${messages.id})`,
      lastActivity: sql<Date | null>`max(${messages.createdAt})`,
      firstQuestion: sql<
        string | null
      >`(select content from messages m2 where m2.conversation_id = ${conversations.id} and m2.role = 'user' order by m2.created_at asc limit 1)`,
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.creatorId, creatorId))
    .groupBy(conversations.id)
    .orderBy(sql`max(${messages.createdAt}) desc nulls last`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    firstQuestion: r.firstQuestion,
    messageCount: Number(r.messageCount),
    lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface ConversationMessage {
  role: string;
  content: string;
  guardrailFlag: string | null;
  createdAt: string;
}

/**
 * Messages of a single conversation, scoped to the creator (so one creator
 * can't read another's conversations). Returns [] for unknown/foreign ids.
 */
export async function getConversationMessages(
  db: Database,
  creatorId: string,
  conversationId: string,
): Promise<ConversationMessage[]> {
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
      guardrailFlag: messages.guardrailFlag,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.creatorId, creatorId)))
    .orderBy(messages.createdAt);

  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    guardrailFlag: r.guardrailFlag,
    createdAt: r.createdAt.toISOString(),
  }));
}

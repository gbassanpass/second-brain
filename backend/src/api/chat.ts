import { Hono } from 'hono';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import {
  type ChatLimits,
  type ChatServices,
  processChat,
  resolveCreatorBySlug,
} from '../services/chat.js';

const chatBody = z.object({
  creatorSlug: z.string().min(1),
  query: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export interface ChatRouterDeps {
  getDb: () => Database;
  getServices: () => ChatServices;
  getConfig: () => Pick<
    Config,
    | 'LLM_DEFAULT_MODEL'
    | 'LLM_FALLBACK_MODEL'
    | 'MAX_TOKENS_PER_REPLY'
    | 'RETRIEVAL_TOP_K'
    | 'RERANK_SCORE_THRESHOLD'
    | 'LLM_ROUTING_FORCE'
    | 'LLM_ROUTING_LONG_QUERY_CHARS'
    | 'LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD'
  >;
}

export function createChatRouter(deps: ChatRouterDeps): Hono {
  const router = new Hono();

  router.post('/', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = chatBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    const db = deps.getDb();
    const creator = await resolveCreatorBySlug(db, parsed.data.creatorSlug);
    if (!creator) {
      return c.json({ error: 'creator_not_found', slug: parsed.data.creatorSlug }, 404);
    }

    const config = deps.getConfig();
    const limits: Partial<ChatLimits> = {
      llmModel: config.LLM_DEFAULT_MODEL,
      llmFallbackModel: config.LLM_FALLBACK_MODEL,
      maxTokens: config.MAX_TOKENS_PER_REPLY,
      retrievalTopK: config.RETRIEVAL_TOP_K,
      rerankScoreThreshold: config.RERANK_SCORE_THRESHOLD,
      routingForce: config.LLM_ROUTING_FORCE,
      routingLongQueryChars: config.LLM_ROUTING_LONG_QUERY_CHARS,
      routingLowConfidenceThreshold: config.LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD,
    };

    try {
      const result = await processChat(db, deps.getServices(), limits, {
        creatorId: creator.id,
        creatorSlug: parsed.data.creatorSlug,
        query: parsed.data.query,
        conversationId: parsed.data.conversationId,
        userId: parsed.data.userId,
      });
      return c.json({
        conversationId: result.conversationId,
        messageId: result.assistantMessageId,
        content: result.content,
        fontes: result.fontes,
        fallback: result.fallback,
        guardrailFlag: result.guardrailFlag,
        guardrail: result.guardrail,
        postFilter: result.postFilter,
        model: result.model,
        routingReason: result.routingReason,
        usage: result.usage,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('persona not set')) {
        return c.json({ error: 'persona_not_set', slug: parsed.data.creatorSlug }, 409);
      }
      if (message.includes('conversation not found')) {
        return c.json({ error: 'conversation_not_found' }, 404);
      }
      if (message.includes('belongs to a different creator')) {
        return c.json({ error: 'conversation_creator_mismatch' }, 403);
      }
      throw err;
    }
  });

  return router;
}

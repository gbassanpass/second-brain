import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { loadGoldenSet } from '../../../eval/loader.js';
import { formatTextReport, saveJsonReport } from '../../../eval/reporter.js';
import { type ChatRunner, runEval } from '../../../eval/runner.js';
import { ConfigError, getConfig } from '../config.js';
import { closeDb, getDb } from '../db/client.js';
import { creators } from '../db/schema.js';
import { createEmbedder } from '../embeddings/factory.js';
import { createLLMClient } from '../llm/factory.js';
import { createReranker } from '../rerank/factory.js';
import { type ChatLimits, processChat } from '../services/chat.js';

// .env lives at the monorepo root (../../../ from this file).
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

async function main() {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n[config] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const set = loadGoldenSet();
  console.info(
    `[eval] creator=${set.creator} questions=${set.questions.length} ` +
      `llm=${config.LLM_PROVIDER}/${config.LLM_DEFAULT_MODEL} ` +
      `embeddings=${config.EMBEDDINGS_PROVIDER} rerank=${config.RERANK_PROVIDER}`,
  );

  const db = getDb();
  const [creator] = await db
    .select({ id: creators.id, slug: creators.slug })
    .from(creators)
    .where(eq(creators.slug, set.creator))
    .limit(1);
  if (!creator) {
    console.error(`[eval] creator not found: slug=${set.creator}. Did you run \`make seed\`?`);
    process.exit(1);
  }

  const services = {
    embedder: createEmbedder(config),
    reranker: createReranker(config),
    llm: createLLMClient(config),
  };
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

  const chatRunner: ChatRunner = async (q) => {
    const result = await processChat(db, services, limits, {
      creatorId: creator.id,
      creatorSlug: creator.slug,
      query: q.query,
    });
    return {
      actual: {
        content: result.content,
        guardrailFlag: result.guardrailFlag,
        fallback: result.fallback,
        postFilter: result.postFilter,
      },
      metrics: {
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        model: result.model,
      },
    };
  };

  try {
    const report = await runEval(set, chatRunner);
    console.info(`\n${formatTextReport(report)}`);

    const reportPath = resolve(
      new URL('../../../eval/reports/latest.json', import.meta.url).pathname,
    );
    saveJsonReport(reportPath, report);
    console.info(`\n[eval] report saved to ${reportPath}`);

    const threshold = Number(process.env.EVAL_PASS_THRESHOLD ?? '0.8');
    if (report.passRate < threshold) {
      console.error(
        `\n[eval] FAIL: passRate ${(report.passRate * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(1)}%`,
      );
      process.exit(1);
    }
    console.info(
      `\n[eval] PASS: passRate ${(report.passRate * 100).toFixed(1)}% ≥ threshold ${(threshold * 100).toFixed(1)}%`,
    );
  } finally {
    await closeDb();
  }
}

await main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});

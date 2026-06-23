import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { ConfigError, getConfig } from '../config.js';
import { closeDb, getDb } from '../db/client.js';
import { creators } from '../db/schema.js';
import { createEmbedder } from '../embeddings/factory.js';
import { createLLMClient } from '../llm/factory.js';
import { buildLLMArgs } from '../rag/prompt.js';
import { retrieveAndRerank } from '../rag/retrieval.js';
import { createReranker } from '../rerank/factory.js';
import { getPersonaCard } from '../services/persona.js';

loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

async function main() {
  const slug = process.argv[2] ?? 'fausto';
  const query = process.argv[3] ?? 'O que ele pensa sobre as eleições de 2026?';

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

  const db = getDb();
  const [creator] = await db
    .select({ id: creators.id })
    .from(creators)
    .where(eq(creators.slug, slug))
    .limit(1);
  if (!creator) {
    console.error(`creator not found: ${slug}`);
    process.exit(1);
  }
  const persona = await getPersonaCard(db, slug);
  if (!persona) {
    console.error(`persona not set for ${slug} (run make seed)`);
    process.exit(1);
  }

  const embedder = createEmbedder(config);
  const reranker = createReranker(config);
  const llm = createLLMClient(config);

  console.info(
    `[prompt-smoke] slug=${slug} llm=${config.LLM_PROVIDER}/${config.LLM_DEFAULT_MODEL} embeddings=${config.EMBEDDINGS_PROVIDER} rerank=${config.RERANK_PROVIDER}`,
  );
  console.info(`[prompt-smoke] query="${query}"\n`);

  const [queryEmbedding] = await embedder.embed([query]);
  if (!queryEmbedding) throw new Error('embedder returned no vectors');
  const retrieval = await retrieveAndRerank(db, reranker, {
    creatorId: creator.id,
    query,
    queryEmbedding,
    topK: 5,
    rerankScoreThreshold: config.RERANK_SCORE_THRESHOLD,
  });

  if (retrieval.fallback === 'no_context') {
    console.info('— "não tenho isso registrado" (sem contexto acima do limiar)');
    return;
  }

  const llmArgs = buildLLMArgs({
    personaCard: persona,
    query,
    chunks: retrieval.hits.map((h) => ({ text: h.text })),
    model: config.LLM_DEFAULT_MODEL,
    maxTokens: config.MAX_TOKENS_PER_REPLY,
  });

  const t0 = Date.now();
  const first = await llm.complete(llmArgs);
  const t1 = Date.now();
  const second = await llm.complete(llmArgs);
  const t2 = Date.now();

  console.info(`--- 1ª chamada (${t1 - t0}ms) ---`);
  console.info(formatUsage(first.usage));
  console.info(
    `resposta: ${first.content.slice(0, 320)}${first.content.length > 320 ? '…' : ''}\n`,
  );

  console.info(`--- 2ª chamada (${t2 - t1}ms) ---`);
  console.info(formatUsage(second.usage));
  console.info(
    second.usage.cacheReadInputTokens
      ? `✅ cache hit: ${second.usage.cacheReadInputTokens} tokens lidos do cache`
      : '⚠️  sem cache_read_input_tokens — verifique o adapter Anthropic',
  );
}

function formatUsage(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}) {
  return [
    `usage: input=${u.inputTokens}`,
    `output=${u.outputTokens}`,
    u.cacheReadInputTokens !== undefined ? `cache_read=${u.cacheReadInputTokens}` : null,
    u.cacheCreationInputTokens !== undefined ? `cache_write=${u.cacheCreationInputTokens}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

main()
  .catch((err: unknown) => {
    console.error('[prompt-smoke] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

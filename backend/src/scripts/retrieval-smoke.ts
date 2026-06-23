import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { ConfigError, getConfig } from '../config.js';
import { closeDb, getDb } from '../db/client.js';
import { creators } from '../db/schema.js';
import { createEmbedder } from '../embeddings/factory.js';
import { hybridSearch } from '../rag/retrieval.js';

loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

async function main() {
  const slug = process.argv[2] ?? 'fausto';
  const query = process.argv[3] ?? 'eleições no Brasil em 2026';
  const topK = Number(process.argv[4] ?? 5);

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
    console.error(`[retrieval-smoke] creator not found: ${slug}`);
    process.exit(1);
  }

  const embedder = createEmbedder(config);
  const [queryEmbedding] = await embedder.embed([query]);
  if (!queryEmbedding) throw new Error('embedder returned no vectors');

  console.info(`[retrieval-smoke] slug=${slug} query="${query}" topK=${topK}\n`);
  const hits = await hybridSearch(db, {
    creatorId: creator.id,
    query,
    queryEmbedding,
    topK,
  });

  for (const [i, h] of hits.entries()) {
    const preview = h.text.replace(/\s+/g, ' ').slice(0, 140);
    console.info(
      `#${i + 1}  rrf=${h.rrfScore.toFixed(4)}  v=${h.vectorRank ?? '-'}  t=${h.textRank ?? '-'}  ord=${h.ordinal}`,
    );
    console.info(`   ${preview}${h.text.length > 140 ? '…' : ''}\n`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[retrieval-smoke] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

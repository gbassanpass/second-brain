import { config as loadEnv } from 'dotenv';
import { ConfigError, getConfig } from '../config.js';
import { closeDb, getDb } from '../db/client.js';
import { createEmbedder } from '../embeddings/factory.js';
import { startIngestWorker } from '../workers/ingest.js';

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

  const db = getDb();
  const embedder = createEmbedder(config);
  const handle = startIngestWorker({
    redisUrl: config.REDIS_URL,
    db,
    embedder,
    onCompleted: (sourceId, result) => {
      console.info(
        `[worker:ingest] indexed source=${sourceId} docs=${result.docs.total} inserted=${result.docs.inserted} chunks=${result.chunks.created}`,
      );
    },
    onFailed: (sourceId, err) => {
      console.error(`[worker:ingest] failed source=${sourceId}: ${err.message}`);
    },
  });

  console.info(
    `[worker:ingest] listening on '${config.REDIS_URL}' (env=${config.APP_ENV} embeddings=${config.EMBEDDINGS_PROVIDER})`,
  );

  const shutdown = async (signal: string) => {
    console.info(`[worker:ingest] received ${signal}, shutting down`);
    try {
      await handle.close();
    } finally {
      await closeDb();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[worker:ingest] fatal:', err);
  process.exitCode = 1;
});

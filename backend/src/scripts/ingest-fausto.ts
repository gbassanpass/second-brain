import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ConfigError, getConfig } from '../config.js';
import { ManualUploadConnector } from '../connectors/manual.js';
import { closeDb, getDb } from '../db/client.js';
import { ensureCreatorBySlug, upsertDocument } from '../services/documents.js';

// .env lives at the monorepo root (../../../ from this file).
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

interface Args {
  slug: string;
  displayName: string;
  baseDir: string;
}

function parseArgs(argv: string[]): Args {
  const slug = argv[2] ?? 'fausto';
  const displayName = argv[3] ?? 'Fausto Bassan';
  const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
  const baseDir = argv[4] ?? resolve(repoRoot, 'data', slug);
  return { slug, displayName, baseDir };
}

async function main() {
  const { slug, displayName, baseDir } = parseArgs(process.argv);

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

  console.info(`[ingest] slug=${slug} baseDir=${baseDir} env=${config.APP_ENV}`);

  const db = getDb();
  const creator = await ensureCreatorBySlug(db, slug, displayName);

  const connector = new ManualUploadConnector({ baseDir });

  let total = 0;
  let created = 0;
  let duplicate = 0;
  const start = Date.now();

  for await (const raw of connector.list(creator.id)) {
    total++;
    const res = await upsertDocument(db, {
      creatorId: creator.id,
      rawText: raw.rawText,
      kind: raw.kind,
      title: raw.title,
      url: raw.url,
      publishedAt: raw.publishedAt,
    });
    if (res.created) created++;
    else duplicate++;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.info(
    `[ingest] done in ${elapsed}s — total=${total} inserted=${created} duplicate=${duplicate}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ingest] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

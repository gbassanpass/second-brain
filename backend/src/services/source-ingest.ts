import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ManualUploadConnector } from '../connectors/manual.js';
import type { Database } from '../db/client.js';
import { contentSources, creators } from '../db/schema.js';
import type { Embedder } from '../embeddings/base.js';
import { upsertDocument } from './documents.js';
import { ensureDocumentIndexed } from './indexing.js';

export interface SyncSourceCounts {
  docs: { total: number; inserted: number; duplicate: number };
  chunks: { created: number };
}

export interface SyncSourceResult extends SyncSourceCounts {
  sourceId: string;
  status: 'indexed';
}

export interface SyncSourceOptions {
  /** Override the connector base dir. Default: `<repo>/data/<creator-slug>`. */
  dataDir?: string;
}

/**
 * Idempotent source sync. Transitions `content_sources.status`:
 *   pending → indexing → (indexed | error).
 *
 * - `indexing` is set BEFORE the connector runs (observability + race guard).
 * - On success: `indexed` + `last_synced_at = now()`.
 * - On error: `error`, and the underlying exception is rethrown so the worker
 *   marks the job failed (BullMQ retry policy / DLQ in the future).
 */
export async function syncContentSource(
  db: Database,
  embedder: Embedder,
  sourceId: string,
  opts: SyncSourceOptions = {},
): Promise<SyncSourceResult> {
  const [source] = await db
    .select({
      id: contentSources.id,
      kind: contentSources.kind,
      creatorId: contentSources.creatorId,
      externalRef: contentSources.externalRef,
      slug: creators.slug,
    })
    .from(contentSources)
    .innerJoin(creators, eq(creators.id, contentSources.creatorId))
    .where(eq(contentSources.id, sourceId))
    .limit(1);
  if (!source) {
    throw new Error(`syncContentSource: source not found: ${sourceId}`);
  }

  await db
    .update(contentSources)
    .set({ status: 'indexing' })
    .where(eq(contentSources.id, sourceId));

  try {
    const counts = await runConnectorForSource(db, embedder, source, opts);
    await db
      .update(contentSources)
      .set({ status: 'indexed', lastSyncedAt: new Date() })
      .where(eq(contentSources.id, sourceId));
    return { sourceId, status: 'indexed', ...counts };
  } catch (err) {
    await db.update(contentSources).set({ status: 'error' }).where(eq(contentSources.id, sourceId));
    throw err;
  }
}

async function runConnectorForSource(
  db: Database,
  embedder: Embedder,
  source: {
    creatorId: string;
    kind: string;
    slug: string;
    externalRef: string | null;
  },
  opts: SyncSourceOptions,
): Promise<SyncSourceCounts> {
  if (source.kind !== 'manual') {
    throw new Error(`syncContentSource: unsupported source kind for MVP: ${source.kind}`);
  }
  const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
  const baseDir = opts.dataDir ?? source.externalRef ?? resolve(repoRoot, 'data', source.slug);

  const connector = new ManualUploadConnector({ baseDir });
  const counts: SyncSourceCounts = {
    docs: { total: 0, inserted: 0, duplicate: 0 },
    chunks: { created: 0 },
  };

  for await (const raw of connector.list(source.creatorId)) {
    counts.docs.total++;
    const upsert = await upsertDocument(db, {
      creatorId: source.creatorId,
      rawText: raw.rawText,
      kind: raw.kind,
      title: raw.title,
      url: raw.url,
      publishedAt: raw.publishedAt,
    });
    if (upsert.created) counts.docs.inserted++;
    else counts.docs.duplicate++;

    const indexed = await ensureDocumentIndexed(db, embedder, {
      creatorId: source.creatorId,
      documentId: upsert.document.id,
      rawText: raw.rawText,
    });
    if (!indexed.skipped) counts.chunks.created += indexed.chunkCount;
  }

  return counts;
}

/**
 * Idempotent helper to ensure a creator has a `manual` content_source. Used by
 * `make ingest-fausto` and tests so callers don't need to seed manually.
 */
export async function ensureManualSource(db: Database, creatorId: string): Promise<{ id: string }> {
  const existing = await db
    .select({ id: contentSources.id })
    .from(contentSources)
    .where(and(eq(contentSources.creatorId, creatorId), eq(contentSources.kind, 'manual')))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(contentSources)
    .values({ creatorId, kind: 'manual', status: 'pending' })
    .returning({ id: contentSources.id });
  if (!row) {
    throw new Error('ensureManualSource: insert returned no row');
  }
  return row;
}

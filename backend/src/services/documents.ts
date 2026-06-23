import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators, documents } from '../db/schema.js';
import type { CreatorRow, DocumentInsert, DocumentRow } from '../db/types.js';

export function computeContentHash(rawText: string): string {
  if (!rawText) {
    throw new Error('computeContentHash requires non-empty rawText');
  }
  return createHash('sha256').update(rawText).digest('hex');
}

/**
 * Idempotent creator upsert by slug. Returns the row regardless of whether it
 * was created or already existed (ON CONFLICT … DO UPDATE SET slug=excluded.slug
 * is a no-op that forces RETURNING to fire on the conflict path).
 */
export async function ensureCreatorBySlug(
  db: Database,
  slug: string,
  displayName: string,
): Promise<CreatorRow> {
  const rows = await db
    .insert(creators)
    .values({ slug, displayName })
    .onConflictDoUpdate({
      target: creators.slug,
      set: { slug: sql`excluded.slug` },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error(`ensureCreatorBySlug returned no row for slug=${slug}`);
  }
  return row as CreatorRow;
}

export interface UpsertDocumentInput {
  creatorId: string;
  rawText: string;
  kind?: DocumentInsert['kind'];
  title?: string | null;
  url?: string | null;
  sourceId?: string | null;
  publishedAt?: Date | null;
}

export interface UpsertDocumentResult {
  document: DocumentRow;
  created: boolean;
  contentHash: string;
}

/**
 * Inserts a document keyed by `(creator_id, content_hash)`. If the same hash
 * was ingested before for this creator, returns the existing row with
 * `created: false`. content_hash = sha256(rawText) — the idempotency key per
 * docs/04 (UNIQUE creator_id, content_hash).
 */
export async function upsertDocument(
  db: Database,
  input: UpsertDocumentInput,
): Promise<UpsertDocumentResult> {
  const contentHash = computeContentHash(input.rawText);

  const inserted = await db
    .insert(documents)
    .values({
      creatorId: input.creatorId,
      rawText: input.rawText,
      contentHash,
      kind: input.kind ?? null,
      title: input.title ?? null,
      url: input.url ?? null,
      sourceId: input.sourceId ?? null,
      publishedAt: input.publishedAt ?? null,
    })
    .onConflictDoNothing({
      target: [documents.creatorId, documents.contentHash],
    })
    .returning();

  if (inserted[0]) {
    return {
      document: inserted[0] as DocumentRow,
      created: true,
      contentHash,
    };
  }

  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.creatorId, input.creatorId), eq(documents.contentHash, contentHash)))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new Error(
      `upsertDocument: conflict but no existing row found (creator=${input.creatorId}, hash=${contentHash}). Likely concurrent delete during ingest.`,
    );
  }
  return { document: row as DocumentRow, created: false, contentHash };
}

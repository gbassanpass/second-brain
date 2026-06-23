import { count, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, contentSources, creators, documents } from '../db/schema.js';
import { personaCardSchema } from '../rag/persona.js';

/**
 * Landing-safe public profile of a creator (E6.1).
 *
 * Deliberately a curated subset of the row + Persona Card — the full persona
 * (frameworks, do/dont, catchphrases) feeds the prompt and is not exposed to
 * anonymous visitors. `oneLiner`/`disclaimer` come from the Persona Card when
 * it's set; both are null until a creator is seeded.
 */
export interface PublicCreator {
  slug: string;
  displayName: string;
  niche: string | null;
  oneLiner: string | null;
  disclaimer: string | null;
}

export async function getPublicCreator(db: Database, slug: string): Promise<PublicCreator | null> {
  const [row] = await db
    .select({
      slug: creators.slug,
      displayName: creators.displayName,
      niche: creators.niche,
      personaCard: creators.personaCard,
    })
    .from(creators)
    .where(eq(creators.slug, slug))
    .limit(1);

  if (!row) return null;

  const card = personaCardSchema.safeParse(row.personaCard);
  return {
    slug: row.slug,
    displayName: row.displayName,
    niche: row.niche ?? null,
    oneLiner: card.success ? card.data.one_liner : null,
    disclaimer: card.success ? (card.data.disclaimer ?? null) : null,
  };
}

export interface SourceSummary {
  id: string;
  kind: string;
  status: string;
  externalRef: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

/** Content sources for the Studio, newest first (E6.4). */
export async function listSources(db: Database, creatorId: string): Promise<SourceSummary[]> {
  const rows = await db
    .select({
      id: contentSources.id,
      kind: contentSources.kind,
      status: contentSources.status,
      externalRef: contentSources.externalRef,
      lastSyncedAt: contentSources.lastSyncedAt,
      createdAt: contentSources.createdAt,
    })
    .from(contentSources)
    .where(eq(contentSources.creatorId, creatorId))
    .orderBy(desc(contentSources.createdAt));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    externalRef: r.externalRef,
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface DocumentSummary {
  id: string;
  title: string | null;
  kind: string | null;
  chunkCount: number;
  createdAt: string;
}

/** Indexed documents for the Studio with their chunk counts, newest first (E6.4). */
export async function listDocuments(db: Database, creatorId: string): Promise<DocumentSummary[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      createdAt: documents.createdAt,
      chunkCount: count(chunks.id),
    })
    .from(documents)
    .leftJoin(chunks, eq(chunks.documentId, documents.id))
    .where(eq(documents.creatorId, creatorId))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    chunkCount: Number(r.chunkCount),
    createdAt: r.createdAt.toISOString(),
  }));
}

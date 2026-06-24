import { and, count, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, contentSources, creators, documents, users } from '../db/schema.js';
import { personaCardSchema } from '../rag/persona.js';

/** Turn a display name into a URL-safe slug (ascii, kebab-case). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export interface CreatedCreator {
  id: string;
  slug: string;
  displayName: string;
}

/**
 * Create a creator owned by `ownerUserId` (self-signup). Slug derives from the
 * name and is made unique with a numeric suffix on collision. Idempotent-ish:
 * if the same owner already has a creator with the same display name, returns
 * it instead of creating a duplicate.
 */
export async function createCreator(
  db: Database,
  input: { displayName: string; ownerUserId: string; niche?: string | null },
): Promise<CreatedCreator> {
  const existing = await db
    .select({ id: creators.id, slug: creators.slug, displayName: creators.displayName })
    .from(creators)
    .where(
      and(eq(creators.ownerUserId, input.ownerUserId), eq(creators.displayName, input.displayName)),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const base = slugify(input.displayName) || 'criador';
  let slug = base;
  for (let n = 2; n < 1000; n += 1) {
    const taken = await db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.slug, slug))
      .limit(1);
    if (!taken[0]) break;
    slug = `${base}-${n}`;
  }

  const [row] = await db
    .insert(creators)
    .values({
      slug,
      displayName: input.displayName,
      niche: input.niche ?? null,
      ownerUserId: input.ownerUserId,
    })
    .returning({ id: creators.id, slug: creators.slug, displayName: creators.displayName });
  if (!row) throw new Error('createCreator: insert returned no row');

  // Promote the owner to `creator` so they can use the Studio (no-op if already
  // creator/operator — we never downgrade an operator).
  await db
    .update(users)
    .set({ role: 'creator' })
    .where(and(eq(users.id, input.ownerUserId), eq(users.role, 'subscriber')));

  return row;
}

export type OwnershipResult = { ok: true; creatorId: string } | { ok: false; status: 404 | 403 };

/**
 * Resolve a creator by slug, enforcing ownership for the Studio (F1.x):
 * operators manage any creator; everyone else only the creators they own.
 */
export async function resolveOwnedCreator(
  db: Database,
  slug: string,
  user: { id: string; role: string },
): Promise<OwnershipResult> {
  const [creator] = await db
    .select({ id: creators.id, ownerUserId: creators.ownerUserId })
    .from(creators)
    .where(eq(creators.slug, slug))
    .limit(1);
  if (!creator) return { ok: false, status: 404 };
  if (user.role === 'operator' || creator.ownerUserId === user.id) {
    return { ok: true, creatorId: creator.id };
  }
  return { ok: false, status: 403 };
}

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

export interface DocumentDetail {
  id: string;
  title: string | null;
  kind: string | null;
  url: string | null;
  text: string;
  chunks: string[];
  publishedAt: string | null;
  createdAt: string;
}

/**
 * Full content of one indexed document, scoped to the creator (F1.9 detail
 * view). Returns null when the id isn't theirs so the API can 404.
 */
export async function getDocumentDetail(
  db: Database,
  creatorId: string,
  documentId: string,
): Promise<DocumentDetail | null> {
  const [doc] = await db
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      url: documents.url,
      rawText: documents.rawText,
      publishedAt: documents.publishedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.creatorId, creatorId)))
    .limit(1);
  if (!doc) return null;

  const chunkRows = await db
    .select({ text: chunks.text })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(chunks.ordinal);

  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    url: doc.url,
    text: doc.rawText,
    chunks: chunkRows.map((c) => c.text),
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

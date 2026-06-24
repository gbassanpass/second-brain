import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, documents, kgEntities, kgRelations } from '../db/schema.js';
import type { LLMClient } from '../llm/base.js';
import { type EntityKind, type ExtractedGraph, extractGraphFromText } from './kg-extract.js';

const DEFAULT_MAX_CHUNKS = 60;

export interface BuildGraphInput {
  creatorId: string;
  creatorName: string;
  model: string;
  maxChunks?: number;
}

export interface BuildGraphResult {
  chunksProcessed: number;
  chunksFailed: number;
  entitiesCreated: number;
  relationsCreated: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Build (or extend) the creator's knowledge graph (F1.5.1). Iterates the
 * creator's chunks, extracts a sub-graph from each via the LLM, and upserts
 * entities + relations. Idempotent: re-running won't duplicate (unique indexes
 * + onConflictDoNothing), so it can be run again after new content lands.
 */
export async function buildGraphForCreator(
  db: Database,
  llm: LLMClient,
  input: BuildGraphInput,
): Promise<BuildGraphResult> {
  const rows = await db
    .select({ id: chunks.id, text: chunks.text })
    .from(chunks)
    .where(eq(chunks.creatorId, input.creatorId))
    .orderBy(asc(chunks.documentId), asc(chunks.ordinal))
    .limit(input.maxChunks ?? DEFAULT_MAX_CHUNKS);

  const result: BuildGraphResult = {
    chunksProcessed: 0,
    chunksFailed: 0,
    entitiesCreated: 0,
    relationsCreated: 0,
  };

  for (const chunk of rows) {
    let extracted: ExtractedGraph;
    try {
      extracted = await extractGraphFromText(llm, {
        creatorName: input.creatorName,
        text: chunk.text,
        model: input.model,
      });
    } catch {
      result.chunksFailed++;
      continue;
    }
    result.chunksProcessed++;

    const persisted = await persistChunkGraph(db, input.creatorId, chunk.id, extracted);
    result.entitiesCreated += persisted.entitiesCreated;
    result.relationsCreated += persisted.relationsCreated;
  }

  return result;
}

async function persistChunkGraph(
  db: Database,
  creatorId: string,
  chunkId: string,
  graph: ExtractedGraph,
): Promise<{ entitiesCreated: number; relationsCreated: number }> {
  // Every name referenced by a relation must exist as an entity. Materialize
  // missing endpoints as `tema` so no relation is dropped for lack of a node.
  const byName = new Map<string, EntityKind>();
  for (const e of graph.entities) if (!byName.has(norm(e.name))) byName.set(norm(e.name), e.kind);
  for (const r of graph.relations) {
    if (!byName.has(norm(r.src))) byName.set(norm(r.src), 'tema');
    if (!byName.has(norm(r.dst))) byName.set(norm(r.dst), 'tema');
  }
  if (byName.size === 0) return { entitiesCreated: 0, relationsCreated: 0 };

  // Preserve original casing for storage; key resolution is case-insensitive.
  const originalCase = new Map<string, string>();
  for (const e of graph.entities)
    if (!originalCase.has(norm(e.name))) originalCase.set(norm(e.name), e.name.trim());
  for (const r of graph.relations) {
    if (!originalCase.has(norm(r.src))) originalCase.set(norm(r.src), r.src.trim());
    if (!originalCase.has(norm(r.dst))) originalCase.set(norm(r.dst), r.dst.trim());
  }

  const entityRows = [...byName].map(([key, kind]) => ({
    creatorId,
    name: originalCase.get(key) ?? key,
    kind,
  }));

  const created = await db.insert(kgEntities).values(entityRows).onConflictDoNothing().returning({
    id: kgEntities.id,
  });

  // Resolve every (lowercased) name to its entity id — includes pre-existing.
  const names = entityRows.map((e) => e.name);
  const all = await db
    .select({ id: kgEntities.id, name: kgEntities.name })
    .from(kgEntities)
    .where(and(eq(kgEntities.creatorId, creatorId), inArray(kgEntities.name, names)));
  const idByName = new Map<string, string>();
  for (const e of all) if (!idByName.has(norm(e.name))) idByName.set(norm(e.name), e.id);

  const relationRows = graph.relations
    .map((r) => {
      const srcId = idByName.get(norm(r.src));
      const dstId = idByName.get(norm(r.dst));
      if (!srcId || !dstId) return null;
      return {
        creatorId,
        srcId,
        dstId,
        relation: r.relation,
        confidence: r.confidence,
        sourceChunk: chunkId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let relationsCreated = 0;
  if (relationRows.length > 0) {
    const insertedRels = await db
      .insert(kgRelations)
      .values(relationRows)
      .onConflictDoNothing()
      .returning({ id: kgRelations.id });
    relationsCreated = insertedRels.length;
  }

  return { entitiesCreated: created.length, relationsCreated };
}

export interface KgEntityView {
  id: string;
  name: string;
  kind: string | null;
}
export interface KgRelationSource {
  documentId: string | null;
  title: string | null;
  url: string | null;
  snippet: string;
}
export interface KgRelationView {
  src: string;
  relation: string;
  dst: string;
  confidence: number;
  /** Where this relation was extracted from (provenance). */
  source: KgRelationSource | null;
}
export interface KnowledgeGraphView {
  entities: KgEntityView[];
  relations: KgRelationView[];
  stats: { entities: number; relations: number };
}

/** Read the stored knowledge graph for inspection / visualization (F1.5). */
export async function getKnowledgeGraph(
  db: Database,
  creatorId: string,
  opts: { maxRelations?: number } = {},
): Promise<KnowledgeGraphView> {
  const entities = await db
    .select({ id: kgEntities.id, name: kgEntities.name, kind: kgEntities.kind })
    .from(kgEntities)
    .where(eq(kgEntities.creatorId, creatorId));

  const nameById = new Map(entities.map((e) => [e.id, e.name]));

  // Join each relation to its source chunk → document for provenance.
  const rels = await db
    .select({
      srcId: kgRelations.srcId,
      dstId: kgRelations.dstId,
      relation: kgRelations.relation,
      confidence: kgRelations.confidence,
      chunkText: chunks.text,
      documentId: documents.id,
      title: documents.title,
      url: documents.url,
    })
    .from(kgRelations)
    .leftJoin(chunks, eq(kgRelations.sourceChunk, chunks.id))
    .leftJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(kgRelations.creatorId, creatorId))
    .limit(opts.maxRelations ?? 500);

  const relations: KgRelationView[] = rels.map((r) => ({
    src: nameById.get(r.srcId) ?? '?',
    relation: r.relation,
    dst: nameById.get(r.dstId) ?? '?',
    confidence: r.confidence,
    source: r.chunkText
      ? {
          documentId: r.documentId,
          title: r.title,
          url: r.url,
          snippet: r.chunkText.replace(/\s+/g, ' ').trim().slice(0, 240),
        }
      : null,
  }));

  return {
    entities: entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
    relations,
    stats: { entities: entities.length, relations: relations.length },
  };
}

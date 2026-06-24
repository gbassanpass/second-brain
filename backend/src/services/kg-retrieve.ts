import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { kgEntities, kgRelations } from '../db/schema.js';

/** A single relevant relation from the knowledge graph, ready for the prompt. */
export interface SubgraphFact {
  src: string;
  relation: string;
  dst: string;
  confidence: number;
  /** Year the relation held, when dated (F1.5.5). */
  year: number | null;
}

export interface RetrieveSubgraphInput {
  creatorId: string;
  query: string;
  /** Chunk ids of the retrieved hits — relations extracted from them are relevant. */
  chunkIds: string[];
  /** Max facts to return. Default 12. */
  maxFacts?: number;
}

/**
 * GraphRAG retrieval (F1.5.2). Pulls the sub-graph relevant to a question by
 * combining two signals:
 *   1. **Provenance** — relations extracted from the chunks we already
 *      retrieved (their `source_chunk` is in the hit set).
 *   2. **Lexical** — entities whose name appears in the question, plus their
 *      1-hop relations (the neighbourhood / principles around the topic).
 * Returned facts feed the prompt so the clone reasons with HOW the creator
 * thinks, not just isolated text snippets. No embeddings needed → cheap.
 */
export async function retrieveSubgraph(
  db: Database,
  input: RetrieveSubgraphInput,
): Promise<SubgraphFact[]> {
  const maxFacts = input.maxFacts ?? 12;
  const query = input.query.trim();
  if (!query) return [];

  // Lexical: entities (≥3 chars) whose name appears in the question.
  const lexical = await db
    .select({ id: kgEntities.id })
    .from(kgEntities)
    .where(
      and(
        eq(kgEntities.creatorId, input.creatorId),
        sql`char_length(${kgEntities.name}) >= 3 and position(lower(${kgEntities.name}) in lower(${query})) > 0`,
      ),
    )
    .limit(40);
  const lexIds = lexical.map((e) => e.id);

  const conds = [];
  if (input.chunkIds.length > 0) conds.push(inArray(kgRelations.sourceChunk, input.chunkIds));
  if (lexIds.length > 0) {
    conds.push(inArray(kgRelations.srcId, lexIds));
    conds.push(inArray(kgRelations.dstId, lexIds));
  }
  if (conds.length === 0) return [];

  const rels = await db
    .select({
      srcId: kgRelations.srcId,
      dstId: kgRelations.dstId,
      relation: kgRelations.relation,
      confidence: kgRelations.confidence,
      validFrom: kgRelations.validFrom,
    })
    .from(kgRelations)
    .where(and(eq(kgRelations.creatorId, input.creatorId), or(...conds)))
    .limit(maxFacts * 4);

  if (rels.length === 0) return [];

  // Resolve entity ids → names in one round trip.
  const ids = [...new Set(rels.flatMap((r) => [r.srcId, r.dstId]))];
  const ents = await db
    .select({ id: kgEntities.id, name: kgEntities.name })
    .from(kgEntities)
    .where(inArray(kgEntities.id, ids));
  const nameById = new Map(ents.map((e) => [e.id, e.name]));

  // Dedupe identical triples, keep the highest-confidence first, cap.
  const seen = new Set<string>();
  const facts: SubgraphFact[] = [];
  for (const r of rels.sort((a, b) => b.confidence - a.confidence)) {
    const src = nameById.get(r.srcId);
    const dst = nameById.get(r.dstId);
    if (!src || !dst) continue;
    const key = `${src}|${r.relation}|${dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      src,
      relation: r.relation,
      dst,
      confidence: r.confidence,
      year: r.validFrom ? r.validFrom.getUTCFullYear() : null,
    });
    if (facts.length >= maxFacts) break;
  }
  return facts;
}

/** Render facts as a readable "how you think" block for the prompt. */
export function formatSubgraph(facts: SubgraphFact[]): string[] {
  return facts.map(
    (f) => `- ${f.src} ${f.relation.replace(/_/g, ' ')} ${f.dst}${f.year ? ` (${f.year})` : ''}`,
  );
}

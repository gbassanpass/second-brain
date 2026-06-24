import { asc, count, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, creators, documents } from '../db/schema.js';

/**
 * Mind graph (F1.18) — the data behind the 3D "visualize the mind" view. For
 * the MVP (pre knowledge-graph, F1.5) the structure is the content hierarchy:
 *   creator → documents → chunks
 * Each node carries a type for coloring and a short label for hover. Chunks are
 * capped so a huge clone doesn't ship thousands of nodes to the browser.
 */
export type MindNodeType = 'creator' | 'document' | 'chunk';

export interface MindNode {
  id: string;
  type: MindNodeType;
  label: string;
  /** Document kind (reel/transcript/article/qa…) — only on document nodes. */
  kind?: string | null;
}

export interface MindLink {
  source: string;
  target: string;
}

export interface MindGraph {
  nodes: MindNode[];
  links: MindLink[];
  /** `chunks` is the true total; `shownChunks` is how many made it into nodes. */
  stats: { documents: number; chunks: number; shownChunks: number };
  /** True when chunks were capped — the UI can show "mostrando N de M". */
  truncated: boolean;
}

const DEFAULT_MAX_CHUNKS = 400;

function snippet(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export async function getMindGraph(
  db: Database,
  creatorId: string,
  opts: { maxChunks?: number } = {},
): Promise<MindGraph> {
  const maxChunks = opts.maxChunks ?? DEFAULT_MAX_CHUNKS;

  const [creator] = await db
    .select({ id: creators.id, displayName: creators.displayName })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (!creator) {
    return {
      nodes: [],
      links: [],
      stats: { documents: 0, chunks: 0, shownChunks: 0 },
      truncated: false,
    };
  }

  const docs = await db
    .select({ id: documents.id, title: documents.title, kind: documents.kind })
    .from(documents)
    .where(eq(documents.creatorId, creatorId));

  const [chunkCount] = await db
    .select({ value: count() })
    .from(chunks)
    .where(eq(chunks.creatorId, creatorId));
  const totalChunks = Number(chunkCount?.value ?? 0);

  const shownChunks = await db
    .select({ id: chunks.id, documentId: chunks.documentId, text: chunks.text })
    .from(chunks)
    .where(eq(chunks.creatorId, creatorId))
    .orderBy(asc(chunks.documentId), asc(chunks.ordinal))
    .limit(maxChunks);

  const truncated = totalChunks > shownChunks.length;

  const nodes: MindNode[] = [
    { id: `creator:${creator.id}`, type: 'creator', label: creator.displayName },
  ];
  const links: MindLink[] = [];

  // Only link chunks to documents we actually emit as nodes.
  const docNodeIds = new Set<string>();
  for (const d of docs) {
    const nodeId = `doc:${d.id}`;
    docNodeIds.add(d.id);
    nodes.push({
      id: nodeId,
      type: 'document',
      label: d.title?.trim() || d.kind || 'Documento',
      kind: d.kind,
    });
    links.push({ source: `creator:${creator.id}`, target: nodeId });
  }

  for (const ch of shownChunks) {
    if (!ch.documentId || !docNodeIds.has(ch.documentId)) continue;
    const nodeId = `chunk:${ch.id}`;
    nodes.push({ id: nodeId, type: 'chunk', label: snippet(ch.text) });
    links.push({ source: `doc:${ch.documentId}`, target: nodeId });
  }

  return {
    nodes,
    links,
    stats: { documents: docs.length, chunks: totalChunks, shownChunks: shownChunks.length },
    truncated,
  };
}

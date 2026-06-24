'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type KnowledgeGraph,
  type MindGraphData,
  type MindNodeType,
  buildKnowledgeGraph,
  fetchKnowledgeGraph,
  fetchMindGraph,
} from '../lib/studio';

// react-force-graph-3d uses WebGL/three.js — browser-only, no SSR.
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

type Mode = 'estrutura' | 'conhecimento';

interface GNode {
  id: string;
  label: string;
  color: string;
  val: number;
}
interface GLink {
  source: string;
  target: string;
  label?: string;
}

const STRUCT_COLOR: Record<MindNodeType, string> = {
  creator: '#d4af37',
  document: '#6ea8fe',
  chunk: '#8b8b94',
};
const STRUCT_SIZE: Record<MindNodeType, number> = { creator: 8, document: 4, chunk: 1.5 };

// Principles/heuristics — "how they think" — get the gold highlight.
const KIND_COLOR: Record<string, string> = {
  principio: '#d4af37',
  heuristica: '#e0b84d',
  pessoa: '#6ea8fe',
  tema: '#4ec9b0',
  evento: '#b48ead',
};
const kindColor = (k: string | null) => (k && KIND_COLOR[k]) || '#8b8b94';

function structToGraph(d: MindGraphData): { nodes: GNode[]; links: GLink[] } {
  return {
    nodes: d.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      color: STRUCT_COLOR[n.type],
      val: STRUCT_SIZE[n.type],
    })),
    links: d.links.map((l) => ({ source: l.source, target: l.target })),
  };
}

function kgToGraph(g: KnowledgeGraph): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = g.entities.map((e) => ({
    id: e.name,
    label: `${e.name}${e.kind ? ` · ${e.kind}` : ''}`,
    color: kindColor(e.kind),
    val: e.kind === 'principio' || e.kind === 'heuristica' ? 5 : 3,
  }));
  const known = new Set(nodes.map((n) => n.id));
  const links = g.relations
    .filter((r) => known.has(r.src) && known.has(r.dst))
    .map((r) => ({ source: r.src, target: r.dst, label: r.relation }));
  return { nodes, links };
}

/**
 * Mind visualization (F1.18 + F1.5). Two modes:
 *  - Estrutura: creator → documents → chunks (content hierarchy).
 *  - Conhecimento: the extracted knowledge graph (entities + relations) — how
 *    the clone reasons. Build it on demand with LLM extraction (F1.5.1).
 */
export function MindGraph({ slug, token }: { slug: string; token: string | null }) {
  const [mode, setMode] = useState<Mode>('estrutura');
  const [struct, setStruct] = useState<MindGraphData | null>(null);
  const [kg, setKg] = useState<KnowledgeGraph | null>(null);
  const [failed, setFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 520;

  useEffect(() => {
    let active = true;
    if (mode === 'estrutura' && !struct) {
      fetchMindGraph(slug, token)
        .then((d) => active && setStruct(d))
        .catch(() => active && setFailed(true));
    }
    if (mode === 'conhecimento' && !kg) {
      fetchKnowledgeGraph(slug, token)
        .then((d) => active && setKg(d))
        .catch(() => active && setFailed(true));
    }
    return () => {
      active = false;
    };
  }, [mode, slug, token, struct, kg]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const extract = useCallback(async () => {
    setBuilding(true);
    setBuildMsg(null);
    try {
      const r = await buildKnowledgeGraph(slug, token);
      setBuildMsg(
        `${r.entitiesCreated} entidades e ${r.relationsCreated} relações novas (${r.chunksProcessed} trechos).`,
      );
      setKg(await fetchKnowledgeGraph(slug, token));
    } catch {
      setBuildMsg('Não consegui extrair o grafo agora.');
    } finally {
      setBuilding(false);
    }
  }, [slug, token]);

  const data =
    mode === 'estrutura' ? (struct ? structToGraph(struct) : null) : kg ? kgToGraph(kg) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-zinc-700 p-0.5">
          {(
            [
              { id: 'estrutura', label: 'Estrutura' },
              { id: 'conhecimento', label: 'Conhecimento' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setFailed(false);
              }}
              className={`rounded-full px-3 py-1 text-xs transition ${
                mode === t.id ? 'bg-accent-gold text-accent' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === 'conhecimento' ? (
          <div className="flex items-center gap-3">
            {kg ? (
              <span className="text-xs text-zinc-500">
                {kg.stats.entities} entidades · {kg.stats.relations} relações
              </span>
            ) : null}
            <button
              type="button"
              onClick={extract}
              disabled={building}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold disabled:opacity-40"
            >
              {building
                ? 'Extraindo…'
                : kg && kg.stats.entities > 0
                  ? 'Atualizar grafo'
                  : 'Extrair grafo'}
            </button>
          </div>
        ) : struct ? (
          <span className="text-xs text-zinc-500">
            {struct.stats.documents} conteúdos · {struct.stats.chunks} trechos
          </span>
        ) : null}
      </div>

      {mode === 'conhecimento' && buildMsg ? (
        <p className="text-xs text-accent-gold">{buildMsg}</p>
      ) : null}

      {failed ? (
        <p className="text-sm text-red-400">Não consegui carregar a visualização.</p>
      ) : !data ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : data.nodes.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
          {mode === 'conhecimento'
            ? 'Nenhum grafo de conhecimento ainda. Clique em "Extrair grafo" para o LLM mapear como o clone pensa.'
            : 'Ainda não há conteúdo para visualizar.'}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-hidden rounded-2xl border border-zinc-800 bg-black"
          style={{ height }}
        >
          <ForceGraph3D
            graphData={data}
            width={width}
            height={height}
            backgroundColor="#0a0a0b"
            nodeLabel="label"
            nodeColor={(n: object) => (n as GNode).color}
            nodeVal={(n: object) => (n as GNode).val}
            nodeOpacity={0.9}
            linkColor={() => '#3f3f46'}
            linkOpacity={0.5}
            linkWidth={0.5}
            linkLabel={(l: object) => (l as GLink).label ?? ''}
            linkDirectionalArrowLength={mode === 'conhecimento' ? 2 : 0}
            linkDirectionalArrowRelPos={1}
            enableNodeDrag={false}
            warmupTicks={40}
          />
        </div>
      )}
      <p className="text-center text-xs text-zinc-600">
        Arraste para girar · scroll para zoom · passe o mouse num nó
        {mode === 'conhecimento' ? ' ou numa relação' : ''}
      </p>
    </div>
  );
}

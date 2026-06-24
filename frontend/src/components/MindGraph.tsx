'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { type MindGraphData, type MindNodeType, fetchMindGraph } from '../lib/studio';

// react-force-graph-3d uses WebGL/three.js — it only works in the browser, so
// load it client-side only (no SSR).
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

const NODE_COLOR: Record<MindNodeType, string> = {
  creator: '#d4af37', // accent gold
  document: '#6ea8fe',
  chunk: '#8b8b94',
};
const NODE_SIZE: Record<MindNodeType, number> = { creator: 8, document: 4, chunk: 1.5 };

const LEGEND: { type: MindNodeType; label: string }[] = [
  { type: 'creator', label: 'Mente' },
  { type: 'document', label: 'Conteúdo' },
  { type: 'chunk', label: 'Trechos' },
];

/**
 * 3D visualization of the clone's mind (F1.18) — creator → documents → chunks.
 * Drag to rotate, scroll to zoom, hover a node for its label.
 */
export function MindGraph({ slug, token }: { slug: string; token: string | null }) {
  const [data, setData] = useState<MindGraphData | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 520;

  useEffect(() => {
    let active = true;
    fetchMindGraph(slug, token)
      .then((d) => active && setData(d))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [slug, token]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (failed) {
    return <p className="text-sm text-red-400">Não consegui carregar a visualização.</p>;
  }
  if (!data) {
    return <p className="text-sm text-zinc-500">Montando a mente em 3D…</p>;
  }
  if (data.nodes.length <= 1) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
        Ainda não há conteúdo para visualizar. Importe posts ou adicione conhecimento.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4">
          {LEGEND.map((l) => (
            <span key={l.type} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: NODE_COLOR[l.type] }}
              />
              {l.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {data.stats.documents} conteúdos · {data.stats.chunks} trechos
          {data.truncated ? ` (mostrando ${data.stats.shownChunks})` : ''}
        </p>
      </div>

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
          nodeColor={(n: object) => NODE_COLOR[(n as { type: MindNodeType }).type]}
          nodeVal={(n: object) => NODE_SIZE[(n as { type: MindNodeType }).type]}
          nodeOpacity={0.9}
          linkColor={() => '#3f3f46'}
          linkOpacity={0.5}
          linkWidth={0.5}
          enableNodeDrag={false}
          warmupTicks={40}
        />
      </div>
      <p className="text-center text-xs text-zinc-600">
        Arraste para girar · scroll para zoom · passe o mouse num nó para ver o conteúdo
      </p>
    </div>
  );
}

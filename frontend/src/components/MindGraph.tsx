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
import type { GLink, GNode } from './MindGraphCanvas';
import { IconClose, IconExternal } from './icons';

// WebGL canvas — browser-only (three.js), and the imperative ref lives inside it.
const MindGraphCanvas = dynamic(() => import('./MindGraphCanvas').then((m) => m.MindGraphCanvas), {
  ssr: false,
});

type Mode = 'estrutura' | 'conhecimento';

const STRUCT_COLOR: Record<MindNodeType, string> = {
  creator: '#ffd56b',
  document: '#6ea8fe',
  chunk: '#9aa0ff',
};
const STRUCT_SIZE: Record<MindNodeType, number> = { creator: 10, document: 4, chunk: 1.5 };

// Principles/heuristics — "how they think" — glow gold.
const KIND_COLOR: Record<string, string> = {
  principio: '#ffd56b',
  heuristica: '#ffcf4d',
  pessoa: '#6ea8fe',
  tema: '#4ec9b0',
  evento: '#c08bff',
};
const kindColor = (k: string | null) => (k && KIND_COLOR[k]) || '#9aa0ff';

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
    val: e.kind === 'principio' || e.kind === 'heuristica' ? 6 : 3,
  }));
  const known = new Set(nodes.map((n) => n.id));
  const links = g.relations
    .filter((r) => known.has(r.src) && known.has(r.dst))
    .map((r) => ({
      source: r.src,
      target: r.dst,
      label: `${r.relation}${r.year ? ` (${r.year})` : ''}`,
    }));
  return { nodes, links };
}

/**
 * Mind visualization (F1.18 + F1.5). Two modes (Estrutura / Conhecimento) and a
 * full-screen immersive view à la delphi.ai/.../visualize — glow + auto-rotate.
 */
export function MindGraph({
  slug,
  token,
  displayName,
}: {
  slug: string;
  token: string | null;
  displayName: string;
}) {
  const [mode, setMode] = useState<Mode>('estrutura');
  const [struct, setStruct] = useState<MindGraphData | null>(null);
  const [kg, setKg] = useState<KnowledgeGraph | null>(null);
  const [failed, setFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [viewport, setViewport] = useState({ w: 1280, h: 720 });
  const inlineHeight = 520;

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

  // Track viewport for full-screen sizing.
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure the inline container once it's actually mounted (after data loads).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach when the box (re)mounts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, struct, kg, fullscreen]);

  // Lock body scroll + allow Esc to close while in full-screen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  // The build now runs on the worker (background). We remember the entity count
  // at click time so the poller knows when the graph has actually grown.
  const buildBaseline = useRef(0);
  const extract = useCallback(async () => {
    buildBaseline.current = kg?.stats.entities ?? 0;
    setBuildMsg('Mapeando como o clone pensa… isso roda em segundo plano.');
    try {
      await buildKnowledgeGraph(slug, token);
      setBuilding(true); // kicks off the polling effect below
    } catch {
      setBuildMsg('Não consegui iniciar a extração agora.');
    }
  }, [slug, token, kg]);

  // While a background build runs, refresh the graph until it grows (or we give
  // up after ~2min). This replaces the old reload-the-page-to-see-it behavior.
  useEffect(() => {
    if (!building) return;
    let active = true;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts += 1;
      const g = await fetchKnowledgeGraph(slug, token).catch(() => null);
      if (!active) return;
      if (g && g.stats.entities > buildBaseline.current) {
        setKg(g);
        setBuildMsg(`Grafo pronto: ${g.stats.entities} conceitos e ${g.stats.relations} conexões.`);
        setBuilding(false);
      } else if (attempts >= 40) {
        setBuildMsg('Ainda processando em segundo plano — volte em instantes.');
        setBuilding(false);
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [building, slug, token]);

  const data =
    mode === 'estrutura' ? (struct ? structToGraph(struct) : null) : kg ? kgToGraph(kg) : null;
  const directed = mode === 'conhecimento';
  const hasNodes = !!data && data.nodes.length > 0;

  const Toggle = (
    <div className="inline-flex rounded-full border border-zinc-700 bg-black/40 p-0.5 backdrop-blur">
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
            setSelectedId(null);
          }}
          className={`rounded-full px-3 py-1 text-xs transition ${
            mode === t.id ? 'bg-accent-gold text-accent' : 'text-zinc-300 hover:text-white'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const ExtractBtn = mode === 'conhecimento' && (
    <button
      type="button"
      onClick={extract}
      disabled={building}
      className="rounded-lg border border-zinc-700 bg-black/40 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur transition hover:border-accent-gold hover:text-accent-gold disabled:opacity-40"
    >
      {building ? 'Extraindo…' : kg && kg.stats.entities > 0 ? 'Atualizar grafo' : 'Extrair grafo'}
    </button>
  );

  const detail = selectedId ? buildDetail(selectedId, mode, displayName, struct, kg) : null;

  const canvas = hasNodes ? (
    <div className="relative h-full w-full">
      <MindGraphCanvas
        nodes={data.nodes}
        links={data.links}
        width={fullscreen ? viewport.w : width}
        height={fullscreen ? viewport.h : inlineHeight}
        directed={directed}
        onSelect={setSelectedId}
      />
      {detail ? <DetailPanel detail={detail} onClose={() => setSelectedId(null)} /> : null}
    </div>
  ) : null;

  // ---- Full-screen immersive view ----
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-[#06070f]">
        {canvas}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-semibold text-white drop-shadow">
              A mente de {displayName}
            </h2>
            <div className="pointer-events-auto flex items-center gap-2">
              {Toggle}
              {ExtractBtn}
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="rounded-full border border-zinc-700 bg-black/40 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur transition hover:text-white"
              >
                Fechar ✕
              </button>
            </div>
          </div>
          <div className="max-w-xs rounded-2xl border border-zinc-800 bg-black/50 p-4 text-xs text-zinc-400 backdrop-blur">
            <p className="mb-2 text-sm font-medium text-zinc-200">Navegação</p>
            <ul className="space-y-1">
              <li>• Arraste para girar</li>
              <li>• Scroll para zoom</li>
              <li>• Passe o mouse num nó{directed ? ' ou relação' : ''}</li>
            </ul>
            {buildMsg ? <p className="mt-2 text-accent-gold">{buildMsg}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  // ---- Inline view ----
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {Toggle}
        <div className="flex items-center gap-3">
          {mode === 'conhecimento' && kg ? (
            <span className="text-xs text-zinc-500">
              {kg.stats.entities} entidades · {kg.stats.relations} relações
            </span>
          ) : null}
          {mode === 'estrutura' && struct ? (
            <span className="text-xs text-zinc-500">
              {struct.stats.documents} conteúdos · {struct.stats.chunks} trechos
            </span>
          ) : null}
          {ExtractBtn}
          {hasNodes ? (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold"
            >
              Tela cheia ⛶
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'conhecimento' && buildMsg ? (
        <p className="text-xs text-accent-gold">{buildMsg}</p>
      ) : null}

      {failed ? (
        <p className="text-sm text-red-400">Não consegui carregar a visualização.</p>
      ) : !data ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : !hasNodes ? (
        <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
          {mode === 'conhecimento'
            ? building
              ? 'Mapeando como o clone pensa… o grafo aparece aqui assim que ficar pronto.'
              : 'O grafo é montado automaticamente após cada importação. Para rodar agora, clique em "Extrair grafo".'
            : 'Ainda não há conteúdo para visualizar.'}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#06070f]"
          style={{ height: inlineHeight }}
        >
          {canvas}
        </div>
      )}
      <p className="text-center text-xs text-zinc-600">
        Arraste para girar · scroll para zoom · clique num nó para detalhes · ⛶ tela cheia
      </p>
    </div>
  );
}

interface DetailSource {
  documentId: string | null;
  title: string | null;
  url: string | null;
  snippet: string;
}
interface DetailRelation {
  text: string;
  confidence: number;
  source: DetailSource | null;
}
interface Detail {
  title: string;
  subtitle?: string;
  body?: string;
  url?: string | null;
  relations?: DetailRelation[];
}

/** Resolve the clicked node id into a rich detail card (source content etc.). */
function buildDetail(
  id: string,
  mode: Mode,
  displayName: string,
  struct: MindGraphData | null,
  kg: KnowledgeGraph | null,
): Detail | null {
  if (mode === 'estrutura') {
    const node = struct?.nodes.find((n) => n.id === id);
    if (!node) return null;
    if (node.type === 'creator') return { title: displayName, subtitle: 'A mente' };
    if (node.type === 'document') {
      return {
        title: node.label,
        subtitle: node.kind ? `Conteúdo · ${node.kind}` : 'Conteúdo',
        url: node.url,
      };
    }
    return {
      title: node.documentTitle || 'Trecho indexado',
      subtitle: 'Trecho do conteúdo',
      body: node.text,
    };
  }
  // Conhecimento: id is the entity name.
  const entity = kg?.entities.find((e) => e.name === id);
  if (!entity) return null;
  const relations = (kg?.relations ?? [])
    .filter((r) => r.src === id || r.dst === id)
    .map((r) => ({
      text: `${r.src} ${r.relation.replace(/_/g, ' ')} ${r.dst}${r.year ? ` (${r.year})` : ''}`,
      confidence: r.confidence,
      source: r.source,
    }));
  return {
    title: entity.name,
    subtitle: entity.kind ? `Entidade · ${entity.kind}` : 'Entidade',
    relations,
  };
}

/** Floating card with the selected node's details + source content. */
function DetailPanel({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <div className="absolute right-3 top-3 bottom-3 z-10 flex w-80 max-w-[85%] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-black/70 backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{detail.title}</p>
          {detail.subtitle ? (
            <p className="mt-0.5 text-xs text-accent-gold">{detail.subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Fechar detalhes"
        >
          <IconClose width={16} height={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm text-zinc-300">
        {detail.url ? (
          <a
            href={detail.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold"
          >
            <IconExternal width={14} height={14} /> Abrir original
          </a>
        ) : null}

        {detail.body ? <p className="whitespace-pre-wrap leading-relaxed">{detail.body}</p> : null}

        {detail.relations ? (
          detail.relations.length === 0 ? (
            <p className="text-xs text-zinc-500">Sem relações registradas.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {detail.relations.map((r, i) => (
                <li
                  key={`${r.text}-${i}`}
                  className="rounded-xl border border-zinc-800 bg-bg-sidebar/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] leading-snug text-zinc-200">{r.text}</p>
                    <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                  {r.source ? (
                    <div className="mt-2 border-t border-zinc-800 pt-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <span>Fonte:</span>
                        {r.source.url ? (
                          <a
                            href={r.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent-gold hover:underline"
                          >
                            {r.source.title || 'conteúdo'} <IconExternal width={11} height={11} />
                          </a>
                        ) : (
                          <span className="text-zinc-400">{r.source.title || 'conteúdo'}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] italic leading-snug text-zinc-500">
                        “{r.source.snippet}”
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

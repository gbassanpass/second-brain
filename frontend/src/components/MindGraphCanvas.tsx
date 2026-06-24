'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial, Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface GNode {
  id: string;
  label: string;
  color: string;
  val: number;
  // Mutated by the force layout once it settles.
  x?: number;
  y?: number;
  z?: number;
}
export interface GLink {
  source: string;
  target: string;
  label?: string;
}

/** Soft radial-gradient texture reused for every node halo (built once). */
function makeGlowTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

/**
 * The WebGL canvas (kept past the `next/dynamic` boundary so the imperative ref
 * stays local). Delphi-grade polish: bloom glow, per-type halos, auto-rotation,
 * node search and a click-to-fly mini-map.
 */
export function MindGraphCanvas({
  nodes,
  links,
  width,
  height,
  directed,
  onSelect,
  chrome = true,
}: {
  nodes: GNode[];
  links: GLink[];
  width: number;
  height: number;
  directed: boolean;
  onSelect?: (id: string) => void;
  /** Show search box + mini-map. Off for the landing teaser. */
  chrome?: boolean;
}) {
  const fgRef = useRef<ForceGraphMethods>();
  const glow = useMemo(makeGlowTexture, []);
  const [query, setQuery] = useState('');
  const [positions, setPositions] = useState<GNode[]>([]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const composer = fg.postProcessingComposer();
      const passes = (composer as unknown as { passes: unknown[] }).passes;
      if (!passes?.some((p) => p instanceof UnrealBloomPass)) {
        composer.addPass(new UnrealBloomPass(new Vector2(width, height), 1.6, 0.8, 0.05));
      }
    } catch {
      /* postprocessing unavailable — graph still renders without glow */
    }
    const controls = fg.controls() as { autoRotate?: boolean; autoRotateSpeed?: number };
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
    }
  }, [width, height]);

  function flyTo(n: GNode) {
    if (n.x == null || n.y == null) return;
    const z = n.z ?? 0;
    const ratio = 1 + 90 / Math.max(Math.hypot(n.x, n.y, z), 1);
    fgRef.current?.cameraPosition(
      { x: n.x * ratio, y: n.y * ratio, z: z * ratio },
      { x: n.x, y: n.y, z },
      1200,
    );
  }

  const matches = query.trim()
    ? nodes.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  // Glowing halo sprite behind each node (only when the texture is available).
  const nodeHalo = glow
    ? (node: object) => {
        const n = node as GNode;
        const sprite = new Sprite(
          new SpriteMaterial({
            map: glow,
            color: new Color(n.color),
            transparent: true,
            opacity: 0.4,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        const s = Math.cbrt(n.val) * 14;
        sprite.scale.set(s, s, 1);
        return sprite;
      }
    : undefined;

  return (
    <div className="relative h-full w-full">
      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes, links }}
        width={width}
        height={height}
        controlType="orbit"
        backgroundColor="#06070f"
        showNavInfo={false}
        nodeLabel="label"
        nodeColor={(n: object) => (n as GNode).color}
        nodeVal={(n: object) => (n as GNode).val}
        nodeOpacity={1}
        nodeResolution={16}
        nodeThreeObjectExtend
        nodeThreeObject={nodeHalo}
        linkColor={() => 'rgba(255,255,255,0.18)'}
        linkWidth={0.4}
        linkLabel={(l: object) => (l as GLink).label ?? ''}
        linkDirectionalArrowLength={directed ? 2.5 : 0}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={directed ? 1 : 0}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleSpeed={0.006}
        enableNodeDrag={false}
        warmupTicks={60}
        cooldownTicks={120}
        onEngineStop={() => setPositions(nodes.map((n) => ({ ...n })))}
        onNodeClick={(node: object) => {
          const n = node as GNode;
          flyTo(n);
          onSelect?.(n.id);
        }}
      />

      {/* Search */}
      {chrome ? (
        <div className="absolute left-3 top-3 z-10 w-56">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nó…"
            className="w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 backdrop-blur focus:border-accent-gold focus:outline-none"
          />
          {matches.length > 0 ? (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-black/80 backdrop-blur">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const live = nodes.find((n) => n.id === m.id);
                      if (live) flyTo(live);
                      onSelect?.(m.id);
                      setQuery('');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-zinc-800"
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="truncate">{m.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Mini-map */}
      {chrome && positions.length > 1 ? <MiniMap nodes={positions} onPick={flyTo} /> : null}
    </div>
  );
}

/** Top-down 2D overview of node positions; click a dot to fly there. */
function MiniMap({ nodes, onPick }: { nodes: GNode[]; onPick: (n: GNode) => void }) {
  const W = 150;
  const H = 110;
  const pad = 6;
  const xs = nodes.map((n) => n.x ?? 0);
  const ys = nodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const sy = (y: number) => pad + ((y - minY) / (maxY - minY || 1)) * (H - 2 * pad);

  return (
    <div className="absolute bottom-3 right-3 z-10 rounded-lg border border-zinc-800 bg-black/60 p-1 backdrop-blur">
      <svg width={W} height={H} aria-label="Mini-mapa">
        <title>Mini-mapa</title>
        {nodes.map((n) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only minimap; keyboard nav is via the search box
          <circle
            key={n.id}
            cx={sx(n.x ?? 0)}
            cy={sy(n.y ?? 0)}
            r={Math.max(1, Math.cbrt(n.val))}
            fill={n.color}
            opacity={0.85}
            className="cursor-pointer"
            onClick={() => onPick(n)}
          />
        ))}
      </svg>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface GNode {
  id: string;
  label: string;
  color: string;
  val: number;
}
export interface GLink {
  source: string;
  target: string;
  label?: string;
}

/**
 * The actual WebGL canvas (kept separate so the imperative ref stays on this
 * side of the `next/dynamic` boundary). Adds the Delphi-style polish: an
 * UnrealBloom glow on the nodes and a slow auto-rotating camera.
 */
export function MindGraphCanvas({
  nodes,
  links,
  width,
  height,
  directed,
  onSelect,
}: {
  nodes: GNode[];
  links: GLink[];
  width: number;
  height: number;
  directed: boolean;
  onSelect?: (id: string) => void;
}) {
  const fgRef = useRef<ForceGraphMethods>();

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Glow — makes bright nodes bloom like the Delphi "mind".
    try {
      const composer = fg.postProcessingComposer();
      // Avoid stacking passes across re-renders.
      const passes = (composer as unknown as { passes: unknown[] }).passes;
      const hasBloom = passes?.some((p) => p instanceof UnrealBloomPass);
      if (!hasBloom) {
        composer.addPass(new UnrealBloomPass(new Vector2(width, height), 1.6, 0.8, 0.05));
      }
    } catch {
      /* postprocessing unavailable — graph still renders without glow */
    }
    // Slow auto-rotation for the ambient, alive feel.
    const controls = fg.controls() as {
      autoRotate?: boolean;
      autoRotateSpeed?: number;
    };
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
    }
  }, [width, height]);

  return (
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
      onNodeClick={(node: object) => {
        const n = node as { id: string; x?: number; y?: number; z?: number };
        // Fly the camera to the clicked node, then surface its details.
        if (n.x != null && n.y != null) {
          const z = n.z ?? 0;
          const dist = 90;
          const ratio = 1 + dist / Math.max(Math.hypot(n.x, n.y, z), 1);
          fgRef.current?.cameraPosition(
            { x: n.x * ratio, y: n.y * ratio, z: z * ratio },
            { x: n.x, y: n.y, z },
            1200,
          );
        }
        onSelect?.(n.id);
      }}
    />
  );
}

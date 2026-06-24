'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { GLink, GNode } from './MindGraphCanvas';

const MindGraphCanvas = dynamic(() => import('./MindGraphCanvas').then((m) => m.MindGraphCanvas), {
  ssr: false,
});

// Small demo graph (a creator's "mind") — purely illustrative for the landing.
const C = { gold: '#ffd56b', blue: '#6ea8fe', teal: '#4ec9b0', purple: '#c08bff', gray: '#9aa0ff' };
const NODES: GNode[] = [
  { id: 'Você', label: 'Você', color: C.gold, val: 8 },
  { id: 'análise fria', label: 'análise fria · princípio', color: C.gold, val: 5 },
  { id: 'quem ganha o quê', label: 'quem ganha o quê · heurística', color: C.gold, val: 5 },
  { id: 'Geopolítica', label: 'Geopolítica · tema', color: C.teal, val: 3 },
  { id: 'Stablecoins', label: 'Stablecoins · tema', color: C.teal, val: 3 },
  { id: 'EUA', label: 'EUA · pessoa', color: C.blue, val: 3 },
  { id: 'China', label: 'China · pessoa', color: C.blue, val: 3 },
  { id: 'Poupança', label: 'Poupança emergente · tema', color: C.teal, val: 3 },
  { id: 'Ártico', label: 'Ártico · tema', color: C.teal, val: 2 },
  { id: 'incerteza', label: 'decidir na incerteza · princípio', color: C.gold, val: 4 },
];
const LINKS: GLink[] = [
  { source: 'Você', target: 'análise fria', label: 'usa' },
  { source: 'Você', target: 'quem ganha o quê', label: 'valoriza' },
  { source: 'Você', target: 'incerteza', label: 'decide por' },
  { source: 'análise fria', target: 'Geopolítica', label: 'aplica em' },
  { source: 'Stablecoins', target: 'Poupança', label: 'pode ameaçar' },
  { source: 'Stablecoins', target: 'EUA', label: 'estratégia de' },
  { source: 'EUA', target: 'China', label: 'rivaliza' },
  { source: 'Geopolítica', target: 'Ártico', label: 'inclui' },
  { source: 'Ártico', target: 'China', label: 'disputa' },
  { source: 'quem ganha o quê', target: 'Stablecoins', label: 'pergunta sobre' },
];

/** Real (lazy) 3D mind graph for the landing — glow + auto-rotate, no chrome. */
export function LandingGraph() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 360 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="aspect-[3/2] overflow-hidden rounded-xl bg-black">
      <MindGraphCanvas
        nodes={NODES}
        links={LINKS}
        width={size.w}
        height={size.h}
        directed
        chrome={false}
      />
    </div>
  );
}

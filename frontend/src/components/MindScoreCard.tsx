'use client';

import { useEffect, useState } from 'react';
import { type MindLevel, type MindScore, fetchMindScore } from '../lib/studio';

const LEVEL_LABEL: Record<MindLevel, string> = {
  iniciante: 'Iniciante',
  aprendiz: 'Aprendiz',
  experiente: 'Experiente',
  mestre: 'Mestre',
};

/**
 * Mind Score (F1.14): a real coverage/maturity gauge for the clone, with a
 * Iniciante → Mestre bar and a concrete next step. Derived from persona,
 * knowledge, training and answer confidence.
 */
export function MindScoreCard({ slug, token }: { slug: string; token: string | null }) {
  const [data, setData] = useState<MindScore | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMindScore(slug, token)
      .then((d) => active && setData(d))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [slug, token]);

  if (failed) return null;
  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-5 py-4 text-sm text-zinc-500">
        Calculando Mind Score…
      </div>
    );
  }

  const c = data.components;
  const bars = [
    { label: 'Persona', points: c.persona.points, max: c.persona.max },
    { label: 'Conhecimento', points: c.knowledge.points, max: c.knowledge.max },
    { label: 'Treino', points: c.training.points, max: c.training.max },
    { label: 'Confiança', points: c.confidence.points, max: c.confidence.max },
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Mind Score</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-100">
            {data.score}
            <span className="text-base font-normal text-zinc-500">/100</span>
          </p>
        </div>
        <span className="rounded-full bg-accent-gold/15 px-3 py-1 text-sm font-semibold text-accent-gold">
          {LEVEL_LABEL[data.level]}
        </span>
      </div>

      {/* Iniciante → Mestre bar */}
      <div className="mt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-accent-gold transition-all"
            style={{ width: `${data.score}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
          <span>Iniciante</span>
          <span>Aprendiz</span>
          <span>Experiente</span>
          <span>Mestre</span>
        </div>
      </div>

      {/* Component breakdown */}
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {bars.map((b) => (
          <li key={b.label}>
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{b.label}</span>
              <span className="text-zinc-500">
                {b.points}/{b.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-zinc-500"
                style={{ width: `${b.max > 0 ? (b.points / b.max) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-xl border border-accent-gold/30 bg-accent-gold/5 px-3 py-2 text-sm text-zinc-300">
        <span className="font-medium text-accent-gold">Próximo passo: </span>
        {data.nextStep}
      </p>
    </div>
  );
}

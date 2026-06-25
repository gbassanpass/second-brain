'use client';

import { useEffect, useState } from 'react';
import { fetchSuggestedQuestions } from '../lib/chat';

interface EmptyStateProps {
  displayName: string;
  tagline: string;
  /** Static fallback (creator-agnostic) used until/if dynamic ones load. */
  suggestions: readonly string[];
  slug: string;
  token: string | null;
  onPick: (text: string) => void;
}

/** Greeting + suggestion cards shown before the first turn (doc 11 §EmptyState). */
export function EmptyState({
  displayName,
  tagline,
  suggestions,
  slug,
  token,
  onPick,
}: EmptyStateProps) {
  // Prefer questions generated from THIS clone's graph (F1.20); fall back to the
  // static examples while loading or if the graph has none yet.
  const [dynamic, setDynamic] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    fetchSuggestedQuestions(slug, token).then((qs) => {
      if (active && qs.length > 0) setDynamic(qs);
    });
    return () => {
      active = false;
    };
  }, [slug, token]);

  const shown = dynamic ?? suggestions;

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <h2 className="text-xl font-semibold text-zinc-100">Converse com {displayName}</h2>
      <p className="mt-2 max-w-md text-sm text-zinc-400">{tagline}</p>
      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {shown.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-accent-gold"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

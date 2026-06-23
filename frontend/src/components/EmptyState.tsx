interface EmptyStateProps {
  displayName: string;
  tagline: string;
  suggestions: readonly string[];
  onPick: (text: string) => void;
}

/** Greeting + suggestion cards shown before the first turn (doc 11 §EmptyState). */
export function EmptyState({ displayName, tagline, suggestions, onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <h2 className="text-xl font-semibold text-zinc-100">Converse com {displayName}</h2>
      <p className="mt-2 max-w-md text-sm text-zinc-400">{tagline}</p>
      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
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

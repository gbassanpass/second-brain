'use client';

import { useEffect, useRef, useState } from 'react';
import { type SourceSummary, fetchSources } from '../lib/studio';
import { IconBell, IconCheck } from './icons';

const IN_PROGRESS = new Set(['pending', 'indexing', 'queued', 'syncing']);

function label(s: SourceSummary): string {
  const base = s.externalRef ? `${s.kind} · ${s.externalRef}` : s.kind;
  return base.length > 36 ? `${base.slice(0, 36)}…` : base;
}

function statusText(s: SourceSummary): string {
  if (s.status === 'indexed') {
    return s.lastSyncedAt
      ? `Importado · ${new Date(s.lastSyncedAt).toLocaleString('pt-BR')}`
      : 'Importado';
  }
  if (s.status === 'pending' || s.status === 'queued') return 'Na fila…';
  if (s.status === 'indexing' || s.status === 'syncing') return 'Importando…';
  if (s.status === 'error' || s.status === 'failed') return 'Falhou';
  return s.status;
}

/**
 * Import activity center (sininho) — polls the creator's sources and shows what
 * is importing vs. already indexed, with a badge while work is in progress.
 * `onComplete` fires when an in-progress source finishes (so the docs refresh).
 */
export function NotificationCenter({
  slug,
  token,
  onComplete,
}: {
  slug: string;
  token: string | null;
  onComplete: () => void;
}) {
  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const prevInProgress = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await fetchSources(slug, token);
        if (!active) return;
        setSources(s);
        const inProgress = s.filter((x) => IN_PROGRESS.has(x.status)).length;
        // Something just finished → let the parent refresh documents.
        if (prevInProgress.current != null && inProgress < prevInProgress.current) onComplete();
        prevInProgress.current = inProgress;
        // Poll fast while importing, slow when idle.
        timer = setTimeout(tick, inProgress > 0 ? 4000 : 25000);
      } catch {
        timer = setTimeout(tick, 25000);
      }
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, token, onComplete]);

  const inProgress = sources?.filter((x) => IN_PROGRESS.has(x.status)).length ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold"
        aria-label="Notificações de importação"
      >
        <IconBell width={18} height={18} />
        {inProgress > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-gold px-1 text-[10px] font-semibold text-accent">
            {inProgress}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* click-away */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-zinc-800 bg-bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between border-zinc-800 border-b px-4 py-3">
              <p className="text-sm font-medium text-zinc-100">Importações</p>
              {inProgress > 0 ? (
                <span className="text-xs text-accent-gold">{inProgress} em andamento</span>
              ) : (
                <span className="text-xs text-zinc-500">tudo em dia</span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {sources === null ? (
                <p className="px-4 py-6 text-sm text-zinc-500">Carregando…</p>
              ) : sources.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">
                  Nenhuma importação ainda. Conecte o Instagram em Conhecimento.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {sources.map((s) => {
                    const done = s.status === 'indexed';
                    const failed = s.status === 'error' || s.status === 'failed';
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            done
                              ? 'bg-accent-gold/15 text-accent-gold'
                              : failed
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {done ? (
                            <IconCheck width={14} height={14} />
                          ) : failed ? (
                            '!'
                          ) : (
                            <span className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-accent-gold" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-zinc-200">{label(s)}</span>
                          <span className="block text-xs text-zinc-500">{statusText(s)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

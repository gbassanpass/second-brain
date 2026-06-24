'use client';

import { useState } from 'react';
import {
  type ContentIdea,
  type CreatorAnalytics,
  type DailyPoint,
  fetchContentIdeas,
  formatLatency,
  formatPercent,
  formatUsd,
} from '../lib/studio';

const ddmm = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/**
 * Rich, actionable Insights (best-in-class): activity trend, KPIs, content
 * gaps (questions the clone couldn't answer = content opportunities) and an
 * LLM content-idea generator from real audience demand.
 */
export function InsightsSection({
  analytics,
  slug,
  token,
}: {
  analytics: CreatorAnalytics;
  slug: string;
  token: string | null;
}) {
  const cards = [
    { label: 'Conversas', value: String(analytics.conversations) },
    { label: 'Respostas', value: String(analytics.assistantMessages) },
    { label: 'Taxa de acerto', value: formatPercent(analytics.answerRate), accent: true },
    { label: 'Custo / resposta', value: formatUsd(analytics.avgCostUsdPerAnswer) },
    { label: 'Latência média', value: formatLatency(analytics.avgLatencyMs) },
    { label: 'Guardrail', value: formatPercent(analytics.guardrailRate) },
  ];

  return (
    <section className="flex flex-col gap-5">
      <ActivityChart points={analytics.dailyActivity} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-4 py-3">
            <p className="text-xs text-zinc-500">{c.label}</p>
            <p
              className={`mt-1 text-lg font-semibold ${c.accent ? 'text-accent-gold' : 'text-zinc-100'}`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <ContentIdeas slug={slug} token={token} hasData={analytics.assistantMessages > 0} />

      {analytics.contentGaps.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-zinc-200">Oportunidades de conteúdo</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Perguntas que seu clone não soube responder — vale criar conteúdo sobre.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {analytics.contentGaps.map((g) => (
              <li
                key={g.question}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-zinc-200"
              >
                <span className="truncate pr-3">{g.question}</span>
                <span className="shrink-0 text-xs text-amber-400/80">{g.count}× sem resposta</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analytics.topQuestions.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-zinc-200">Perguntas mais frequentes</p>
          <ol className="mt-2 flex flex-col gap-1">
            {analytics.topQuestions.map((q) => (
              <li
                key={q.question}
                className="flex items-center justify-between rounded-xl bg-bg-sidebar px-3 py-2 text-sm text-zinc-200"
              >
                <span className="truncate pr-3">{q.question}</span>
                <span className="shrink-0 text-xs text-zinc-500">{q.count}×</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

/** Interactive daily activity chart (CSS-hover tooltips, no deps). */
function ActivityChart({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.messages));
  const total = points.reduce((s, p) => s + p.messages, 0);
  const first = points[0]?.date;
  const last = points.at(-1)?.date;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-zinc-200">Atividade (30 dias)</p>
        <p className="text-xs text-zinc-500">{total} mensagens</p>
      </div>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Sem atividade ainda — aparece aqui quando a audiência conversar.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-36 items-end gap-px">
            {points.map((p) => (
              <div key={p.date} className="group relative flex flex-1 justify-center">
                <div
                  className="w-full min-h-[2px] rounded-t bg-accent-gold/60 transition group-hover:bg-accent-gold"
                  style={{ height: `${(p.messages / max) * 100}%` }}
                />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg border border-zinc-700 bg-black/90 px-2 py-1 text-[10px] text-zinc-200 group-hover:block">
                  {ddmm(p.date)} · {p.messages} msg · {p.conversations} conv
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>{first ? ddmm(first) : ''}</span>
            <span>{last ? ddmm(last) : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** LLM content-idea generator from audience demand + gaps. */
function ContentIdeas({
  slug,
  token,
  hasData,
}: {
  slug: string;
  token: string | null;
  hasData: boolean;
}) {
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setIdeas(await fetchContentIdeas(slug, token));
    } catch {
      setError('Não consegui gerar pautas agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent-gold/30 bg-accent-gold/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">✨ Pautas sugeridas</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ideias de conteúdo a partir do que sua audiência pergunta (e do que falta).
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !hasData}
          className="shrink-0 rounded-xl bg-accent-gold px-4 py-2 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Gerando…' : ideas ? 'Gerar de novo' : 'Sugerir pautas'}
        </button>
      </div>
      {!hasData ? (
        <p className="mt-2 text-xs text-zinc-500">Disponível quando houver conversas.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      {ideas && ideas.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Ainda não há perguntas suficientes para sugerir.
        </p>
      ) : null}
      {ideas && ideas.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {ideas.map((idea) => (
            <li key={idea.title} className="rounded-xl border border-zinc-800 bg-bg-sidebar p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{idea.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                    idea.basedOn === 'lacuna'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {idea.basedOn === 'lacuna' ? 'lacuna' : 'demanda'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug text-zinc-400">{idea.angle}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { generatePersona, importInstagram, parseInstagramHandle } from '../lib/onboarding';
import {
  type CreatorAnalytics,
  type DocumentSummary,
  type Me,
  type PersonaForm,
  type SourceSummary,
  canUseStudio,
  fetchAnalytics,
  fetchDocuments,
  fetchMe,
  fetchPersonaForm,
  fetchSources,
  formToPersona,
  formatLatency,
  formatPercent,
  formatUsd,
  personaFormError,
  savePersona,
} from '../lib/studio';
import { useSession } from '../lib/useSession';
import { ConversationsSection } from './ConversationsSection';
import { TrainRoom } from './TrainRoom';

type Section = 'insights' | 'conversations' | 'audience' | 'knowledge' | 'profile' | 'train';

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'insights', label: 'Insights', icon: '📈' },
  { id: 'conversations', label: 'Conversas', icon: '💬' },
  { id: 'audience', label: 'Audiência', icon: '👥' },
  { id: 'knowledge', label: 'Conhecimento', icon: '🧠' },
  { id: 'profile', label: 'Persona', icon: '🪪' },
  { id: 'train', label: 'Treinar', icon: '🎯' },
];

const EMPTY_FORM: PersonaForm = {
  name: '',
  one_liner: '',
  voice: '',
  frameworks: '',
  do: '',
  dont: '',
  catchphrases: '',
  disclaimer: '',
};

type Phase = 'loading' | 'anon' | 'forbidden' | 'ready' | 'error';

export function StudioRoom({ slug, displayName }: { slug: string; displayName: string }) {
  const { status, accessToken } = useSession();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState<PersonaForm>(EMPTY_FORM);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [section, setSection] = useState<Section>('insights');

  useEffect(() => {
    if (status === 'loading') {
      setPhase('loading');
      return;
    }
    if (status === 'anon') {
      setPhase('anon');
      return;
    }
    let active = true;
    setPhase('loading');
    (async () => {
      const profile = await fetchMe(accessToken);
      if (!active) return;
      setMe(profile);
      if (!canUseStudio(profile?.role)) {
        setPhase('forbidden');
        return;
      }
      try {
        const [persona, srcs, docs, stats] = await Promise.all([
          fetchPersonaForm(slug, accessToken),
          fetchSources(slug, accessToken),
          fetchDocuments(slug, accessToken),
          fetchAnalytics(slug, accessToken),
        ]);
        if (!active) return;
        setForm(persona);
        setSources(srcs);
        setDocuments(docs);
        setAnalytics(stats);
        setPhase('ready');
      } catch {
        if (active) setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [status, accessToken, slug]);

  if (phase === 'loading') return <Centered>Carregando o Studio…</Centered>;
  if (phase === 'anon')
    return (
      <Centered>
        <p className="text-sm text-zinc-400">Entre para acessar o Studio.</p>
        <a href="/login" className="mt-3 inline-block text-sm text-accent-gold underline">
          Entrar
        </a>
      </Centered>
    );
  if (phase === 'forbidden')
    return (
      <Centered>
        Acesso restrito. Sua conta ({me?.role ?? 'desconhecida'}) não pode editar este criador.
      </Centered>
    );
  if (phase === 'error') return <Centered>Não consegui carregar os dados do Studio.</Centered>;

  return (
    <div className="flex min-h-screen bg-bg text-zinc-100">
      {/* Sidebar nav (estilo Delphi) */}
      <aside className="flex w-56 shrink-0 flex-col border-zinc-800 border-r bg-bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2 px-2 pb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-gold text-sm font-semibold text-accent">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">painel do criador</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                section === n.id
                  ? 'bg-bg-assistant text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <a
          href={`/c/${slug}/chat`}
          className="mt-auto rounded-xl bg-accent-gold px-3 py-2 text-center text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Testar o clone
        </a>
      </aside>

      {/* Conteúdo da seção */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
          <h1 className="text-2xl font-semibold">{NAV.find((n) => n.id === section)?.label}</h1>

          {section === 'insights' &&
            (analytics ? (
              <AnalyticsSection analytics={analytics} />
            ) : (
              <Empty>Sem dados ainda.</Empty>
            ))}

          {section === 'profile' && (
            <ProfileSection slug={slug} token={accessToken} form={form} onChange={setForm} />
          )}

          {section === 'knowledge' && (
            <KnowledgeSection
              slug={slug}
              token={accessToken}
              sources={sources}
              documents={documents}
            />
          )}

          {section === 'conversations' && (
            <ConversationsSection
              slug={slug}
              token={accessToken}
              initials={displayName.slice(0, 1).toUpperCase()}
            />
          )}

          {section === 'audience' && (
            <Empty>
              Em breve: gerencie quem fala com seu clone — liberar por e-mail, código de acesso ou
              link de pagamento.
            </Empty>
          )}

          {section === 'train' && (
            <TrainRoom slug={slug} displayName={displayName} token={accessToken} />
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileSection({
  slug,
  token,
  form,
  onChange,
}: {
  slug: string;
  token: string | null;
  form: PersonaForm;
  onChange: (f: PersonaForm) => void;
}) {
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  async function regen() {
    setGenBusy(true);
    setGenMsg(null);
    const ok = await generatePersona(slug, token);
    setGenBusy(false);
    setGenMsg(ok ? 'Persona regenerada — recarregue para ver.' : 'Falha ao gerar (há conteúdo?).');
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Edite a voz do clone, ou gere a partir do conteúdo importado.
        </p>
        <button
          type="button"
          onClick={regen}
          disabled={genBusy}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold disabled:opacity-40"
        >
          {genBusy ? 'Gerando…' : 'Gerar do conteúdo'}
        </button>
      </div>
      {genMsg ? <p className="text-xs text-accent-gold">{genMsg}</p> : null}
      <PersonaEditor slug={slug} token={token} form={form} onChange={onChange} />
    </div>
  );
}

function KnowledgeSection({
  slug,
  token,
  sources,
  documents,
}: {
  slug: string;
  token: string | null;
  sources: SourceSummary[];
  documents: DocumentSummary[];
}) {
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function connect() {
    const h = parseInstagramHandle(handle);
    if (!h) {
      setMsg('Informe uma URL ou @ do Instagram válido.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await importInstagram(slug, h, token);
      setMsg('Importando em segundo plano — o status aparece em Fontes em instantes.');
      setHandle('');
    } catch {
      setMsg('Não consegui iniciar a importação.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-700 bg-bg-assistant p-4">
        <p className="text-sm font-medium">Conectar Instagram</p>
        <div className="mt-3 flex gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="https://www.instagram.com/seuperfil"
            className="flex-1 rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <button
            type="button"
            onClick={connect}
            disabled={busy || !handle.trim()}
            className="rounded-xl bg-accent-gold px-4 py-2 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </div>
        {msg ? <p className="mt-2 text-xs text-zinc-400">{msg}</p> : null}
      </div>
      <SourcesSection sources={sources} />
      <DocumentsSection documents={documents} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}

function AnalyticsSection({ analytics }: { analytics: CreatorAnalytics }) {
  const cards = [
    { label: 'Conversas', value: String(analytics.conversations) },
    { label: 'Respostas', value: String(analytics.assistantMessages) },
    { label: 'Custo total', value: formatUsd(analytics.totalCostUsd) },
    { label: 'Custo / resposta', value: formatUsd(analytics.avgCostUsdPerAnswer) },
    { label: 'Latência média', value: formatLatency(analytics.avgLatencyMs) },
    { label: 'Taxa de guardrail', value: formatPercent(analytics.guardrailRate) },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Analytics</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3"
          >
            <p className="text-xs text-zinc-500">{c.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{c.value}</p>
          </div>
        ))}
      </div>
      {analytics.topQuestions.length > 0 ? (
        <div className="mt-2">
          <p className="text-sm text-zinc-400">Perguntas mais frequentes</p>
          <ol className="mt-2 flex flex-col gap-1">
            {analytics.topQuestions.map((q) => (
              <li
                key={q.question}
                className="flex items-center justify-between rounded-xl bg-bg-assistant px-3 py-2 text-sm text-zinc-200"
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

function PersonaEditor({
  slug,
  token,
  form,
  onChange,
}: {
  slug: string;
  token: string | null;
  form: PersonaForm;
  onChange: (f: PersonaForm) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    (key: keyof PersonaForm, value: string) => onChange({ ...form, [key]: value }),
    [form, onChange],
  );

  async function save() {
    const validation = personaFormError(form);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await savePersona(slug, formToPersona(form), token);
      setSavedAt('Salvo.');
    } catch {
      setError('Falha ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Persona Card</h2>
      <Field label="Nome" value={form.name} onChange={(v) => set('name', v)} />
      <Field
        label="Descrição (uma linha)"
        value={form.one_liner}
        onChange={(v) => set('one_liner', v)}
      />
      <AreaField label="Voz (um por linha)" value={form.voice} onChange={(v) => set('voice', v)} />
      <AreaField
        label="Frameworks (um por linha)"
        value={form.frameworks}
        onChange={(v) => set('frameworks', v)}
      />
      <AreaField label="Faz (um por linha)" value={form.do} onChange={(v) => set('do', v)} />
      <AreaField
        label="Não faz (um por linha)"
        value={form.dont}
        onChange={(v) => set('dont', v)}
      />
      <AreaField
        label="Bordões (um por linha)"
        value={form.catchphrases}
        onChange={(v) => set('catchphrases', v)}
      />
      <Field label="Disclaimer" value={form.disclaimer} onChange={(v) => set('disclaimer', v)} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-accent-gold px-5 py-2.5 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Salvando…' : 'Salvar Persona'}
        </button>
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
        {!error && savedAt ? <span className="text-sm text-accent-gold">{savedAt}</span> : null}
      </div>
    </section>
  );
}

function SourcesSection({ sources }: { sources: SourceSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Fontes</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhuma fonte conectada ainda — o conteúdo é ingerido via pipeline (MVP).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm"
            >
              <span className="text-zinc-200">{s.kind}</span>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentsSection({ documents }: { documents: DocumentSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Conteúdo indexado</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum documento indexado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm"
            >
              <span className="text-zinc-200">{d.title ?? 'Sem título'}</span>
              <span className="text-xs text-zinc-500">{d.chunkCount} trechos</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const done = status === 'indexed';
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        done ? 'bg-accent-gold/15 text-accent-gold' : 'bg-zinc-700 text-zinc-300'
      }`}
    >
      {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-zinc-700 bg-bg-assistant px-3 py-2 text-zinc-100 focus:border-accent-gold focus:outline-none"
      />
    </label>
  );
}

function AreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="resize-y rounded-xl border border-zinc-700 bg-bg-assistant px-3 py-2 text-zinc-100 focus:border-accent-gold focus:outline-none"
      />
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center text-sm text-zinc-300">
      {children}
    </main>
  );
}

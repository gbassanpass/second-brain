'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type DocumentSummary,
  type Me,
  type PersonaForm,
  type SourceSummary,
  canUseStudio,
  fetchDocuments,
  fetchMe,
  fetchPersonaForm,
  fetchSources,
  formToPersona,
  personaFormError,
  savePersona,
} from '../lib/studio';
import { useSession } from '../lib/useSession';

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
        const [persona, srcs, docs] = await Promise.all([
          fetchPersonaForm(slug, accessToken),
          fetchSources(slug, accessToken),
          fetchDocuments(slug, accessToken),
        ]);
        if (!active) return;
        setForm(persona);
        setSources(srcs);
        setDocuments(docs);
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Studio · {displayName}</h1>
          <p className="text-xs uppercase tracking-wide text-zinc-500">painel do criador</p>
        </div>
        <a
          href={`/c/${slug}/chat`}
          className="rounded-2xl bg-accent-gold px-4 py-2 text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Testar o clone
        </a>
      </header>

      <PersonaEditor slug={slug} token={accessToken} form={form} onChange={setForm} />
      <SourcesSection sources={sources} />
      <DocumentsSection documents={documents} />
    </main>
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

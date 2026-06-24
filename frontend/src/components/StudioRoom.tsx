'use client';

import { useCallback, useEffect, useState } from 'react';
import { type KnowledgeInput, addKnowledge } from '../lib/knowledge';
import { generatePersona, importInstagram, parseInstagramHandle } from '../lib/onboarding';
import {
  type CreatorAnalytics,
  type DocumentDetail,
  type DocumentSummary,
  type Leniency,
  type Me,
  type PersonaForm,
  type SourceSummary,
  canUseStudio,
  fetchAnalytics,
  fetchDocumentDetail,
  fetchDocuments,
  fetchLeniency,
  fetchMe,
  fetchPersonaForm,
  fetchSources,
  formToPersona,
  personaFormError,
  saveLeniency,
  savePersona,
} from '../lib/studio';
import { useSession } from '../lib/useSession';
import { AccessCodesSection } from './AccessCodesSection';
import { ConversationsSection } from './ConversationsSection';
import { InsightsSection } from './InsightsSection';
import { Markdown } from './Markdown';
import { MindGraph } from './MindGraph';
import { MindScoreCard } from './MindScoreCard';
import { TrainRoom } from './TrainRoom';
import {
  IconAudience,
  IconClose,
  IconConversations,
  IconExternal,
  IconInsights,
  IconKnowledge,
  IconMind,
  IconPersona,
  IconTrain,
} from './icons';

type Section =
  | 'insights'
  | 'conversations'
  | 'audience'
  | 'knowledge'
  | 'mind'
  | 'profile'
  | 'train';

const NAV: { id: Section; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: 'insights', label: 'Insights', Icon: IconInsights },
  { id: 'conversations', label: 'Conversas', Icon: IconConversations },
  { id: 'audience', label: 'Audiência', Icon: IconAudience },
  { id: 'knowledge', label: 'Conhecimento', Icon: IconKnowledge },
  { id: 'mind', label: 'Mente 3D', Icon: IconMind },
  { id: 'profile', label: 'Persona', Icon: IconPersona },
  { id: 'train', label: 'Treinar', Icon: IconTrain },
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

  const reloadDocuments = useCallback(() => {
    fetchDocuments(slug, accessToken)
      .then(setDocuments)
      .catch(() => undefined);
  }, [slug, accessToken]);

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
              <n.Icon className={section === n.id ? 'text-accent-gold' : ''} />
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

          {section === 'insights' && (
            <div className="flex flex-col gap-6">
              <MindScoreCard slug={slug} token={accessToken} />
              {analytics ? (
                <InsightsSection analytics={analytics} slug={slug} token={accessToken} />
              ) : (
                <Empty>Sem conversas ainda — os números aparecem quando a audiência usar.</Empty>
              )}
            </div>
          )}

          {section === 'profile' && (
            <ProfileSection slug={slug} token={accessToken} form={form} onChange={setForm} />
          )}

          {section === 'knowledge' && (
            <KnowledgeSection
              slug={slug}
              token={accessToken}
              sources={sources}
              documents={documents}
              onAdded={reloadDocuments}
            />
          )}

          {section === 'conversations' && (
            <ConversationsSection
              slug={slug}
              token={accessToken}
              initials={displayName.slice(0, 1).toUpperCase()}
            />
          )}

          {section === 'audience' && <AccessCodesSection slug={slug} token={accessToken} />}

          {section === 'mind' && (
            <MindGraph slug={slug} token={accessToken} displayName={displayName} />
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
      <LeniencySetting slug={slug} token={token} />
      <PersonaEditor slug={slug} token={token} form={form} onChange={onChange} />
    </div>
  );
}

const LENIENCY_OPTIONS: { id: Leniency; label: string; hint: string }[] = [
  { id: 'strict', label: 'Conservador', hint: 'Só responde o que está registrado' },
  { id: 'balanced', label: 'Equilibrado', hint: 'Infere dos princípios quando há base forte' },
  { id: 'open', label: 'Livre', hint: 'Extrapola mais dos princípios' },
];

/** Leniency control (F1.5.4): how far the clone may extrapolate. */
function LeniencySetting({ slug, token }: { slug: string; token: string | null }) {
  const [level, setLevel] = useState<Leniency | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLeniency(slug, token)
      .then((l) => active && setLevel(l))
      .catch(() => active && setLevel('balanced'));
    return () => {
      active = false;
    };
  }, [slug, token]);

  async function pick(l: Leniency) {
    if (l === level) return;
    const prev = level;
    setLevel(l);
    setSaving(true);
    try {
      await saveLeniency(slug, l, token);
    } catch {
      setLevel(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-700 bg-bg-assistant p-4">
      <p className="text-sm font-medium">Liberdade de inferência</p>
      <p className="mt-1 text-xs text-zinc-500">
        Quando não há trecho direto, quanto o clone pode responder derivando dos princípios (grafo
        de conhecimento).
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {LENIENCY_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={saving}
            onClick={() => pick(o.id)}
            className={`rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${
              level === o.id
                ? 'border-accent-gold bg-accent-gold/10'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}
          >
            <span
              className={`block text-xs font-semibold ${level === o.id ? 'text-accent-gold' : 'text-zinc-200'}`}
            >
              {o.label}
            </span>
            <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function KnowledgeSection({
  slug,
  token,
  sources,
  documents,
  onAdded,
}: {
  slug: string;
  token: string | null;
  sources: SourceSummary[];
  documents: DocumentSummary[];
  onAdded: () => void;
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
      <AddKnowledge slug={slug} token={token} onAdded={onAdded} />
      <SourcesSection sources={sources} />
      <DocumentsSection slug={slug} token={token} documents={documents} />
    </div>
  );
}

type KnowledgeTab = 'note' | 'qa';

/** Add Knowledge (F1.9) — manually add free text or a Q&A to the base. */
function AddKnowledge({
  slug,
  token,
  onAdded,
}: {
  slug: string;
  token: string | null;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<KnowledgeTab>('note');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const ready = tab === 'note' ? text.trim().length > 0 : question.trim() && answer.trim();

  async function submit() {
    if (!ready || busy) return;
    const input: KnowledgeInput =
      tab === 'note'
        ? { type: 'note', text: text.trim(), title: title.trim() || undefined }
        : { type: 'qa', question: question.trim(), answer: answer.trim() };
    setBusy(true);
    setMsg(null);
    try {
      await addKnowledge(slug, input, token);
      setMsg('Adicionado e indexado ✓ — o clone já pode usar.');
      setTitle('');
      setText('');
      setQuestion('');
      setAnswer('');
      onAdded();
    } catch {
      setMsg('Não consegui adicionar agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-700 bg-bg-assistant p-4">
      <p className="text-sm font-medium">Adicionar conhecimento</p>
      <p className="mt-1 text-xs text-zinc-500">
        Ensine o clone com um texto livre ou um par pergunta/resposta. Fica disponível na hora.
      </p>

      <div className="mt-3 flex gap-2">
        {(
          [
            { id: 'note', label: 'Texto' },
            { id: 'qa', label: 'Pergunta & resposta' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setMsg(null);
            }}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              tab === t.id
                ? 'border-accent-gold text-accent-gold'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {tab === 'note' ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título (opcional)"
              className="rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
            />
            <textarea
              value={text}
              rows={5}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole ou escreva o que o clone deve saber…"
              className="resize-y rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
            />
          </>
        ) : (
          <>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Pergunta (ex.: Qual seu livro favorito?)"
              className="rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
            />
            <textarea
              value={answer}
              rows={4}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Resposta, na sua voz…"
              className="resize-y rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
            />
          </>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">URL, YouTube e arquivo em breve.</span>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className="rounded-xl bg-accent-gold px-4 py-2 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
        {msg ? <p className="text-xs text-zinc-400">{msg}</p> : null}
      </div>
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

function DocumentsSection({
  slug,
  token,
  documents,
}: {
  slug: string;
  token: string | null;
  documents: DocumentSummary[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Conteúdo indexado</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum documento indexado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenId(d.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-left text-sm transition hover:border-accent-gold"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {d.kind ? (
                    <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      {d.kind}
                    </span>
                  ) : null}
                  <span className="truncate text-zinc-200">{d.title ?? 'Sem título'}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                  {d.chunkCount} trechos
                  <span className="text-zinc-600">→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openId ? (
        <DocumentDetailModal
          slug={slug}
          token={token}
          id={openId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

function DocumentDetailModal({
  slug,
  token,
  id,
  onClose,
}: {
  slug: string;
  token: string | null;
  id: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDocumentDetail(slug, id, token)
      .then((d) => active && setDoc(d))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [slug, id, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <button
      type="button"
      aria-label="Fechar"
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation only; Esc closes via window listener */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl cursor-auto flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-bg-sidebar"
      >
        {failed ? (
          <div className="p-6 text-sm text-red-400">Não consegui carregar o conteúdo.</div>
        ) : !doc ? (
          <div className="p-6 text-sm text-zinc-500">Carregando…</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {doc.kind ? (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      {doc.kind}
                    </span>
                  ) : null}
                  <h3 className="truncate text-base font-semibold text-zinc-100">
                    {doc.title ?? 'Sem título'}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {doc.chunks.length} trechos indexados
                  {doc.publishedAt
                    ? ` · ${new Date(doc.publishedAt).toLocaleDateString('pt-BR')}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold"
                  >
                    <IconExternal width={13} height={13} /> Original
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                  aria-label="Fechar"
                >
                  <IconClose width={16} height={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <Markdown>{doc.text}</Markdown>
            </div>
          </>
        )}
      </div>
    </button>
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

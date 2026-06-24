'use client';

import { useState } from 'react';
import { postChat } from '../lib/chat';
import { RATING_OPTIONS, type TrainRating, submitCorrection } from '../lib/train';
import { Markdown } from './Markdown';

/**
 * Train flow (F1.12) — owner-only. Ask a question your audience asks, see how
 * the clone answers, rate it, and (if off) teach the right answer. The
 * correction is saved as a high-signal Q&A so retrieval uses it next time.
 */
export function TrainRoom({
  slug,
  displayName,
  token,
}: {
  slug: string;
  displayName: string;
  token: string | null;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [rating, setRating] = useState<TrainRating | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAnswer(null);
    setRating(null);
    setEditing(false);
    setDraft('');
    setSaved(false);
    setError(null);
  }

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    reset();
    setAsking(true);
    try {
      const res = await postChat({ creatorSlug: slug, query: q }, token);
      setAnswer(res.content);
      setDraft(res.content);
    } catch {
      setError('Não consegui gerar a resposta agora.');
    } finally {
      setAsking(false);
    }
  }

  async function save() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setError(null);
    const ok = await submitCorrection(
      slug,
      { question: question.trim(), answer: draft.trim(), rating: rating ?? undefined },
      token,
    );
    setSaving(false);
    if (ok) {
      setSaved(true);
      setEditing(false);
    } else {
      setError('Não consegui salvar a correção.');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-zinc-400">
        Pergunte algo que sua audiência pergunta, veja como {displayName} responde e ensine a
        resposta certa. O que você corrigir vira conhecimento de alta prioridade — na próxima
        pergunta parecida, o clone usa a sua versão.
      </p>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
          placeholder="Ex.: O que você acha de faculdade?"
          className="flex-1 rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
        />
        <button
          type="button"
          onClick={ask}
          disabled={asking || !question.trim()}
          className="rounded-2xl bg-accent-gold px-5 py-3 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
        >
          {asking ? 'Pensando…' : 'Perguntar'}
        </button>
      </div>

      {answer !== null && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-bg-sidebar p-4">
          <div>
            <p className="text-xs text-zinc-500">Resposta atual do clone</p>
            <div className="mt-1">
              <Markdown>{answer}</Markdown>
            </div>
          </div>

          {saved ? (
            <p className="rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-3 py-2 text-sm text-accent-gold">
              Aprendido ✓ — vou usar a sua versão na próxima pergunta parecida.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs text-zinc-500">Essa resposta soa como você?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RATING_OPTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRating(r.id);
                        if (r.id !== 'exato') setEditing(true);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        rating === r.id
                          ? 'border-accent-gold text-accent-gold'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="w-fit text-sm text-accent-gold underline"
                >
                  Ensinar a resposta certa
                </button>
              )}

              {editing && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-zinc-500">Como você responderia (edite à vontade)</p>
                  <textarea
                    value={draft}
                    rows={5}
                    onChange={(e) => setDraft(e.target.value)}
                    className="resize-y rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 focus:border-accent-gold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !draft.trim()}
                    className="w-fit rounded-2xl bg-accent-gold px-5 py-2.5 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
                  >
                    {saving ? 'Ensinando…' : 'Salvar correção'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

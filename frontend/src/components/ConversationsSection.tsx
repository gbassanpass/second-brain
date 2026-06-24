'use client';

import { useEffect, useState } from 'react';
import {
  type ConversationMessage,
  type ConversationSummary,
  fetchConversationMessages,
  fetchConversations,
} from '../lib/studio';
import { Markdown } from './Markdown';

/** Conversations the audience had with the clone (F1.13) — master/detail. */
export function ConversationsSection({
  slug,
  token,
  initials,
}: {
  slug: string;
  token: string | null;
  initials: string;
}) {
  const [convs, setConvs] = useState<ConversationSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    let active = true;
    fetchConversations(slug, token)
      .then((c) => active && setConvs(c))
      .catch(() => active && setConvs([]));
    return () => {
      active = false;
    };
  }, [slug, token]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingMsgs(true);
    fetchConversationMessages(slug, selected, token)
      .then((m) => active && setMessages(m))
      .catch(() => active && setMessages([]))
      .finally(() => active && setLoadingMsgs(false));
    return () => {
      active = false;
    };
  }, [selected, slug, token]);

  if (convs === null) return <p className="text-sm text-zinc-500">Carregando conversas…</p>;
  if (convs.length === 0)
    return (
      <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
        Ainda não há conversas. Quando alguém falar com seu clone, aparece aqui.
      </div>
    );

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* lista */}
      <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
        {convs.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelected(c.id)}
              className={`w-full rounded-xl px-3 py-2 text-left transition ${
                selected === c.id ? 'bg-bg-assistant' : 'hover:bg-bg-assistant/60'
              }`}
            >
              <p className="truncate text-sm text-zinc-200">
                {c.firstQuestion ?? 'Conversa sem pergunta'}
              </p>
              <p className="text-[11px] text-zinc-500">{c.messageCount} mensagens</p>
            </button>
          </li>
        ))}
      </ul>

      {/* detalhe */}
      <div className="min-h-[200px] rounded-2xl border border-zinc-800 bg-bg-sidebar p-4">
        {!selected ? (
          <p className="text-sm text-zinc-500">Selecione uma conversa.</p>
        ) : loadingMsgs ? (
          <p className="text-sm text-zinc-500">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) =>
              m.role === 'assistant' ? (
                <div key={`${m.createdAt}-${i}`} className="flex gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-gold text-[11px] font-semibold text-accent"
                    aria-hidden
                  >
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <Markdown>{m.content}</Markdown>
                  </div>
                </div>
              ) : (
                <div key={`${m.createdAt}-${i}`} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-bg-assistant px-3 py-2 text-sm text-zinc-100">
                    {m.content}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

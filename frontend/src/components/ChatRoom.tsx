'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage, assistantMessageFromResponse, postChat } from '../lib/chat';
import type { LandingView } from '../lib/creator';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';

const PENDING_ID = '__pending__';

export function ChatRoom({ view }: { view: LandingView }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new message/state
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const send = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (!query || isSending) return;
      setError(null);
      setIsSending(true);

      seq.current += 1;
      const userMsg: ChatMessage = {
        id: `u-${seq.current}`,
        role: 'user',
        content: query,
        sources: [],
        guardrail: false,
        pending: false,
      };
      const pending: ChatMessage = {
        id: PENDING_ID,
        role: 'assistant',
        content: '',
        sources: [],
        guardrail: false,
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, pending]);

      try {
        const res = await postChat({
          creatorSlug: view.slug,
          query,
          conversationId: conversationId.current,
        });
        conversationId.current = res.conversationId;
        const assistant = assistantMessageFromResponse(res);
        setMessages((prev) => prev.map((m) => (m.id === PENDING_ID ? assistant : m)));
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== PENDING_ID));
        setError('Não consegui responder agora. Tente novamente.');
      } finally {
        setIsSending(false);
      }
    },
    [isSending, view.slug],
  );

  function newConversation() {
    conversationId.current = undefined;
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-zinc-100">
      <TopBar view={view} onNew={newConversation} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState
              displayName={view.displayName}
              tagline={view.tagline}
              suggestions={view.exampleQuestions}
              onPick={send}
            />
          ) : (
            <MessageList messages={messages} initials={view.initials} />
          )}
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <Composer
            disabled={isSending}
            placeholder={`Pergunte para ${view.displayName}…`}
            onSend={send}
          />
          <p className="mt-2 text-center text-xs text-zinc-500">{view.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ view, onNew }: { view: LandingView; onNew: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-gold text-sm font-semibold text-accent"
          aria-hidden
        >
          {view.initials}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">{view.displayName}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent-gold">
            mente digital
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold"
      >
        Nova conversa
      </button>
    </header>
  );
}

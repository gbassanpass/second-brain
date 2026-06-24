'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChatMessage,
  assistantMessageFromResponse,
  fetchAccess,
  postChat,
  startCheckout,
} from '../lib/chat';
import type { LandingView } from '../lib/creator';
import { useSession } from '../lib/useSession';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';

const PENDING_ID = '__pending__';

type Gate = 'loading' | 'anon' | 'allowed' | 'blocked';

export function ChatRoom({ view }: { view: LandingView }) {
  const { status, accessToken, email, signOut } = useSession();
  const [gate, setGate] = useState<Gate>('loading');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resolve the paywall once auth settles. Anonymous visitors are sent to login.
  useEffect(() => {
    if (status === 'loading') {
      setGate('loading');
      return;
    }
    if (status === 'anon') {
      setGate('anon');
      return;
    }
    let active = true;
    setGate('loading');
    fetchAccess(view.slug, accessToken).then((verdict) => {
      if (!active) return;
      if (verdict === 'allowed') setGate('allowed');
      else if (verdict === 'payment_required') setGate('blocked');
      else setGate('anon');
    });
    return () => {
      active = false;
    };
  }, [status, accessToken, view.slug]);

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
        const res = await postChat(
          { creatorSlug: view.slug, query, conversationId: conversationId.current },
          accessToken,
        );
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
    [isSending, view.slug, accessToken],
  );

  async function subscribe() {
    setCheckoutBusy(true);
    setError(null);
    try {
      window.location.href = await startCheckout(view.slug, accessToken);
    } catch {
      setCheckoutBusy(false);
      setError('Não consegui abrir o checkout. Tente novamente.');
    }
  }

  function newConversation() {
    conversationId.current = undefined;
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-zinc-100">
      <TopBar view={view} email={email} onNew={newConversation} onSignOut={signOut} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && gate === 'allowed' ? (
            <EmptyState
              displayName={view.displayName}
              tagline={view.tagline}
              suggestions={view.exampleQuestions}
              onPick={send}
            />
          ) : (
            <MessageList
              messages={messages}
              initials={view.initials}
              slug={view.slug}
              token={accessToken}
            />
          )}
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <GateArea
            gate={gate}
            view={view}
            isSending={isSending}
            checkoutBusy={checkoutBusy}
            onSend={send}
            onSubscribe={subscribe}
          />
          <p className="mt-2 text-center text-xs text-zinc-500">{view.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}

function GateArea({
  gate,
  view,
  isSending,
  checkoutBusy,
  onSend,
  onSubscribe,
}: {
  gate: Gate;
  view: LandingView;
  isSending: boolean;
  checkoutBusy: boolean;
  onSend: (text: string) => void;
  onSubscribe: () => void;
}) {
  if (gate === 'loading') {
    return <p className="py-3 text-center text-sm text-zinc-500">Verificando acesso…</p>;
  }
  if (gate === 'anon') {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <p className="text-sm text-zinc-400">Entre para conversar com {view.displayName}.</p>
        <a
          href="/login"
          className="rounded-2xl bg-accent-gold px-5 py-2.5 text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Entrar
        </a>
      </div>
    );
  }
  if (gate === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <p className="text-sm text-zinc-300">
          Assine para conversar com a mente digital de {view.displayName}.
        </p>
        <button
          type="button"
          onClick={onSubscribe}
          disabled={checkoutBusy}
          className="rounded-2xl bg-accent-gold px-5 py-2.5 text-sm font-semibold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {checkoutBusy ? 'Abrindo checkout…' : 'Assinar'}
        </button>
      </div>
    );
  }
  return (
    <Composer
      disabled={isSending}
      placeholder={`Pergunte para ${view.displayName}…`}
      onSend={onSend}
    />
  );
}

function TopBar({
  view,
  email,
  onNew,
  onSignOut,
}: {
  view: LandingView;
  email: string | null;
  onNew: () => void;
  onSignOut: () => void;
}) {
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNew}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold"
        >
          Nova conversa
        </button>
        {email ? (
          <button
            type="button"
            onClick={onSignOut}
            title={email}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-accent-gold"
          >
            Sair
          </button>
        ) : null}
      </div>
    </header>
  );
}

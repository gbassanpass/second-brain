'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REDEEM_MESSAGES, redeemAccessCode } from '../lib/accessCodes';
import {
  type ChatMessage,
  assistantMessageFromResponse,
  fetchAccess,
  postChat,
  startCheckout,
} from '../lib/chat';
import type { LandingView } from '../lib/creator';
import { currentPathWithQuery, withRedirect } from '../lib/redirect';
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
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
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
    (async () => {
      const verdict = await fetchAccess(view.slug, accessToken);
      if (!active) return;
      if (verdict === 'allowed') return setGate('allowed');
      if (verdict !== 'payment_required') return setGate('anon');

      // Blocked. If the link carried ?code=, try to redeem it automatically.
      const urlCode = new URLSearchParams(window.location.search).get('code');
      if (urlCode) {
        const outcome = await redeemAccessCode(view.slug, urlCode, accessToken);
        if (!active) return;
        if (outcome.ok) return setGate('allowed');
        setRedeemMsg(REDEEM_MESSAGES[outcome.reason] ?? 'Não consegui validar o código.');
      }
      setGate('blocked');
    })();
    return () => {
      active = false;
    };
  }, [status, accessToken, view.slug]);

  const redeem = useCallback(
    async (code: string): Promise<void> => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setRedeemMsg(null);
      const outcome = await redeemAccessCode(view.slug, trimmed, accessToken);
      if (outcome.ok) {
        setGate('allowed');
        return;
      }
      setRedeemMsg(REDEEM_MESSAGES[outcome.reason] ?? 'Não consegui validar o código.');
    },
    [view.slug, accessToken],
  );

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
        citations: [],
        guardrail: false,
        extrapolated: false,
        pending: false,
      };
      const pending: ChatMessage = {
        id: PENDING_ID,
        role: 'assistant',
        content: '',
        sources: [],
        citations: [],
        guardrail: false,
        extrapolated: false,
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
              slug={view.slug}
              token={accessToken}
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
            redeemMsg={redeemMsg}
            onSend={send}
            onSubscribe={subscribe}
            onRedeem={redeem}
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
  redeemMsg,
  onSend,
  onSubscribe,
  onRedeem,
}: {
  gate: Gate;
  view: LandingView;
  isSending: boolean;
  checkoutBusy: boolean;
  redeemMsg: string | null;
  onSend: (text: string) => void;
  onSubscribe: () => void;
  onRedeem: (code: string) => void;
}) {
  if (gate === 'loading') {
    return <p className="py-3 text-center text-sm text-zinc-500">Verificando acesso…</p>;
  }
  if (gate === 'anon') {
    // Carry the current chat URL (incl. ?code=) so login/signup return here.
    const back = currentPathWithQuery();
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <p className="text-sm text-zinc-400">Entre para conversar com {view.displayName}.</p>
        <div className="flex gap-2">
          <a
            href={withRedirect('/login', back)}
            className="rounded-2xl bg-accent-gold px-5 py-2.5 text-sm font-semibold text-accent transition hover:opacity-90"
          >
            Entrar
          </a>
          <a
            href={withRedirect('/signup', back)}
            className="rounded-2xl border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-accent-gold hover:text-accent-gold"
          >
            Criar conta
          </a>
        </div>
      </div>
    );
  }
  if (gate === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-3 py-3 text-center">
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
        <RedeemForm redeemMsg={redeemMsg} onRedeem={onRedeem} />
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

/** "Tenho um código de acesso" — redeem a code instead of paying (F1.17). */
function RedeemForm({
  redeemMsg,
  onRedeem,
}: {
  redeemMsg: string | null;
  onRedeem: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 underline transition hover:text-accent-gold"
      >
        Tenho um código de acesso
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRedeem(code);
          }}
          placeholder="CÓDIGO"
          className="w-36 rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-center font-mono text-sm tracking-widest text-zinc-100 placeholder:text-zinc-600 focus:border-accent-gold focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onRedeem(code)}
          disabled={!code.trim()}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-accent-gold hover:text-accent-gold disabled:opacity-40"
        >
          Liberar
        </button>
      </div>
      {redeemMsg ? <p className="text-xs text-red-400">{redeemMsg}</p> : null}
    </div>
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

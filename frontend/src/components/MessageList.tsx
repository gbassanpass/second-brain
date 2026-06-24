'use client';

import type { ChatMessage } from '../lib/chat';
import { Markdown } from './Markdown';
import { SpeakButton } from './SpeakButton';

interface MessageListProps {
  messages: ChatMessage[];
  /** Creator initials for the assistant avatar. */
  initials: string;
  /** Creator slug + access token for the "speak" (TTS) button (F1.3). */
  slug: string;
  token: string | null;
}

/** Conversation transcript (doc 11 §MessageList). Assistant left + avatar, user right. */
export function MessageList({ messages, initials, slug, token }: MessageListProps) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m) =>
        m.role === 'assistant' ? (
          <AssistantRow key={m.id} message={m} initials={initials} slug={slug} token={token} />
        ) : (
          <UserRow key={m.id} message={m} />
        ),
      )}
    </div>
  );
}

function AssistantRow({
  message,
  initials,
  slug,
  token,
}: {
  message: ChatMessage;
  initials: string;
  slug: string;
  token: string | null;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold text-xs font-semibold text-accent"
        aria-hidden
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        {message.guardrail ? <GuardrailNotice /> : null}
        {message.pending ? <ThinkingDots /> : <Markdown>{message.content}</Markdown>}
        {!message.pending && message.content ? (
          <div className="mt-2">
            <SpeakButton slug={slug} text={message.content} token={token} />
          </div>
        ) : null}
        {message.sources.length > 0 ? <Sources sources={message.sources} /> : null}
      </div>
    </div>
  );
}

function UserRow({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-bg-assistant px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100">
        {message.content}
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: ChatMessage['sources'] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Fontes">
      {sources.map((s) =>
        s.url ? (
          <li key={s.documentId}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-bg px-3 py-1 text-xs text-zinc-400 transition hover:border-accent-gold hover:text-accent-gold"
            >
              {s.label} ↗
            </a>
          </li>
        ) : (
          <li
            key={s.documentId}
            className="rounded-full border border-zinc-700 bg-bg px-3 py-1 text-xs text-zinc-400"
          >
            {s.label}
          </li>
        ),
      )}
    </ul>
  );
}

/** Investment guardrail — a discreet notice, NOT a red error (doc 11 §GuardrailNotice). */
function GuardrailNotice() {
  return (
    <div className="mb-2 rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-3 py-2 text-xs text-accent-gold">
      Conteúdo educativo, sem recomendação de compra ou venda de ativos.
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Pensando">
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" />
    </div>
  );
}

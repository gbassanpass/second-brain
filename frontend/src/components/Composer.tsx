'use client';

import { useRef, useState } from 'react';
import { shouldSubmitOnKey } from '../lib/chat';

interface ComposerProps {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
}

/**
 * Auto-growing textarea inside a rounded box (doc 11 §Composer): Enter sends,
 * Shift+Enter inserts a newline, and IME composition is respected so Enter
 * doesn't submit mid-composition.
 */
export function Composer({ disabled, placeholder, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  function grow() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = 'auto';
    });
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-zinc-700 bg-bg-assistant p-2 focus-within:border-accent-gold">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label="Mensagem"
        className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        onChange={(e) => {
          setText(e.target.value);
          grow();
        }}
        onKeyDown={(e) => {
          if (shouldSubmitOnKey(e.key, e.shiftKey, e.nativeEvent.isComposing)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || text.trim().length === 0}
        aria-label="Enviar mensagem"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-gold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <title>Enviar</title>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}

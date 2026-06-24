'use client';

import { useEffect, useRef, useState } from 'react';
import { synthesizeSpeech } from '../lib/voice';

type State = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Plays a clone reply out loud (F1.3). Lazily synthesizes on first click,
 * caches the audio URL so replays are instant, and toggles play/pause.
 */
export function SpeakButton({
  slug,
  text,
  token,
}: {
  slug: string;
  text: string;
  token: string | null;
}) {
  const [state, setState] = useState<State>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function toggle() {
    // Pause if currently playing.
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('idle');
      return;
    }

    try {
      if (!urlRef.current) {
        setState('loading');
        urlRef.current = await synthesizeSpeech(slug, text, token);
      }
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio(urlRef.current);
        audio.onended = () => setState('idle');
        audio.onerror = () => setState('error');
        audioRef.current = audio;
      }
      await audio.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }

  const label =
    state === 'loading'
      ? 'Gerando áudio…'
      : state === 'playing'
        ? 'Pausar'
        : state === 'error'
          ? 'Áudio indisponível'
          : 'Ouvir';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === 'loading'}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-bg px-3 py-1 text-xs text-zinc-400 transition hover:border-accent-gold hover:text-accent-gold disabled:opacity-50"
    >
      <span aria-hidden>{state === 'playing' ? '⏸' : state === 'loading' ? '…' : '🔊'}</span>
      {label}
    </button>
  );
}

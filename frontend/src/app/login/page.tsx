'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function sendMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus('sending');
    setMessage('');
    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/c/fausto/chat` : undefined;
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Falha ao enviar o link.');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Enviamos um link mágico para o seu e-mail — sem senha.
        </p>
      </div>

      {status === 'sent' ? (
        <p className="rounded-2xl border border-accent-gold/40 bg-accent-gold/10 px-4 py-3 text-sm text-accent-gold">
          Link enviado para <strong>{email}</strong>. Abra seu e-mail para continuar.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMagicLink();
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            aria-label="E-mail"
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === 'sending' || email.trim().length === 0}
            className="rounded-2xl bg-accent-gold px-4 py-3 text-sm font-semibold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === 'sending' ? 'Enviando…' : 'Enviar link mágico'}
          </button>
          {status === 'error' ? <p className="text-sm text-red-400">{message}</p> : null}
        </form>
      )}
    </main>
  );
}

'use client';

import { useState } from 'react';
import { DEFAULT_AFTER_AUTH, useRedirectTarget, withRedirect } from '../../lib/redirect';
import { getSupabaseBrowserClient } from '../../lib/supabase';

type Status = 'idle' | 'working' | 'check_email' | 'error';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  // If they arrived from a shared chat link, return there after signup instead
  // of pushing everyone into "create your own mind". Read after mount to avoid
  // a hydration mismatch (server has no `window`).
  const target = useRedirectTarget();
  const after = target ?? DEFAULT_AFTER_AUTH;
  // Audience (came from a creator link) vs creator (generic signup).
  const isAudience = target !== null;

  async function signUp() {
    const e = email.trim();
    if (!e || password.length < 6) {
      setStatus('error');
      setMessage('Informe um e-mail e uma senha de pelo menos 6 caracteres.');
      return;
    }
    setStatus('working');
    setMessage('');
    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}${after}` : undefined;
      const { data, error } = await getSupabaseBrowserClient().auth.signUp({
        email: e,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      // With email confirmation disabled (local) a session comes back right away
      // → go to the return path. Otherwise ask them to confirm by email.
      if (data.session) {
        window.location.href = after;
        return;
      }
      setStatus('check_email');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Não consegui criar a conta.');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {isAudience
            ? 'Crie sua conta para continuar a conversa.'
            : 'Crie sua conta para montar a sua mente digital.'}
        </p>
      </div>

      {status === 'check_email' ? (
        <p className="rounded-2xl border border-accent-gold/40 bg-accent-gold/10 px-4 py-3 text-sm text-accent-gold">
          Conta criada! Confirme seu e-mail (<strong>{email}</strong>) para continuar.
        </p>
      ) : (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            signUp();
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="voce@email.com"
            aria-label="E-mail"
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            placeholder="senha (mín. 6 caracteres)"
            aria-label="Senha"
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === 'working'}
            className="rounded-2xl bg-accent-gold px-4 py-3 text-sm font-semibold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === 'working' ? 'Criando…' : 'Criar conta'}
          </button>
          {status === 'error' ? <p className="text-sm text-red-400">{message}</p> : null}
        </form>
      )}

      <p className="text-center text-sm text-zinc-500">
        Já tem conta?{' '}
        <a
          href={target ? withRedirect('/login', target) : '/login'}
          className="text-accent-gold underline"
        >
          Entrar
        </a>
      </p>
    </main>
  );
}

'use client';

import { useState } from 'react';
import { DEFAULT_AFTER_AUTH, useRedirectTarget, withRedirect } from '../../lib/redirect';
import { fetchMe } from '../../lib/studio';
import { getSupabaseBrowserClient } from '../../lib/supabase';

type Status = 'idle' | 'working' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  // Explicit return path (e.g. a shared chat link). Read after mount to avoid a
  // hydration mismatch (server has no `window`). When absent, we route by role:
  // an owner goes to their Studio, a new user to onboarding.
  const explicit = useRedirectTarget();
  const target = explicit ?? DEFAULT_AFTER_AUTH;

  async function signInWithPassword() {
    const e = email.trim();
    if (!e || !password) return;
    setStatus('working');
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
      // A shared link wins; otherwise send owners to their Studio.
      if (explicit) {
        window.location.href = explicit;
        return;
      }
      const { data } = await supabase.auth.getSession();
      const me = await fetchMe(data.session?.access_token ?? null);
      window.location.href = me?.creatorSlug ? `/studio/${me.creatorSlug}` : DEFAULT_AFTER_AUTH;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Falha ao entrar.');
    }
  }

  async function sendMagicLink() {
    const e = email.trim();
    if (!e) return;
    setStatus('working');
    setMessage('');
    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}${target}` : undefined;
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: e,
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
        <p className="mt-2 text-sm text-zinc-400">Use e-mail e senha, ou um link mágico.</p>
      </div>

      {status === 'sent' ? (
        <p className="rounded-2xl border border-accent-gold/40 bg-accent-gold/10 px-4 py-3 text-sm text-accent-gold">
          Link enviado para <strong>{email}</strong>. Abra seu e-mail (Mailpit em dev) para
          continuar.
        </p>
      ) : (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            signInWithPassword();
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
            placeholder="senha"
            aria-label="Senha"
            className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === 'working' || email.trim().length === 0 || password.length === 0}
            className="rounded-2xl bg-accent-gold px-4 py-3 text-sm font-semibold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === 'working' ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={status === 'working' || email.trim().length === 0}
            className="text-sm text-zinc-400 underline transition hover:text-zinc-200 disabled:opacity-40"
          >
            Enviar link mágico
          </button>
          {status === 'error' ? <p className="text-sm text-red-400">{message}</p> : null}
        </form>
      )}

      <p className="text-center text-sm text-zinc-500">
        Não tem conta?{' '}
        <a href={withRedirect('/signup', target)} className="text-accent-gold underline">
          Criar conta
        </a>
      </p>
    </main>
  );
}

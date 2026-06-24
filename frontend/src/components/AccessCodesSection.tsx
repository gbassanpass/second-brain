'use client';

import { useEffect, useState } from 'react';
import {
  type AccessCode,
  accessCodeLink,
  createAccessCode,
  fetchAccessCodes,
  setAccessCodeActive,
} from '../lib/accessCodes';

/**
 * Audience access control (F1.17): the creator generates codes that let people
 * talk to the clone without paying. List + create + activate/deactivate + copy
 * a shareable link.
 */
export function AccessCodesSection({ slug, token }: { slug: string; token: string | null }) {
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [label, setLabel] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAccessCodes(slug, token)
      .then((c) => active && setCodes(c))
      .catch(() => active && setCodes([]));
    return () => {
      active = false;
    };
  }, [slug, token]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const max = Number.parseInt(maxRedemptions, 10);
      const code = await createAccessCode(
        slug,
        {
          label: label.trim() || undefined,
          maxRedemptions: Number.isFinite(max) && max > 0 ? max : undefined,
        },
        token,
      );
      setCodes((prev) => [code, ...(prev ?? [])]);
      setLabel('');
      setMaxRedemptions('');
    } catch {
      setError('Não consegui gerar o código.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(code: AccessCode) {
    try {
      const updated = await setAccessCodeActive(slug, code.id, !code.active, token);
      setCodes((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch {
      setError('Não consegui atualizar o código.');
    }
  }

  async function copyLink(code: AccessCode) {
    try {
      await navigator.clipboard.writeText(accessCodeLink(slug, code.code));
      setCopied(code.id);
      setTimeout(() => setCopied((c) => (c === code.id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-400">
        Gere códigos de acesso para liberar quem fala com seu clone sem precisar pagar — pilotos,
        beta, convidados. Compartilhe o código ou o link.
      </p>

      <div className="rounded-2xl border border-zinc-700 bg-bg-assistant p-4">
        <p className="text-sm font-medium">Novo código</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rótulo (opcional), ex.: Lançamento Instagram"
            className="flex-1 rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
          />
          <input
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Limite de usos (vazio = ilimitado)"
            className="w-full rounded-xl border border-zinc-700 bg-bg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none sm:w-56"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="rounded-xl bg-accent-gold px-4 py-2 text-sm font-semibold text-accent transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      </div>

      {codes === null ? (
        <p className="text-sm text-zinc-500">Carregando códigos…</p>
      ) : codes.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-bg-sidebar px-6 py-10 text-center text-sm text-zinc-400">
          Nenhum código ainda. Gere o primeiro acima.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {codes.map((code) => (
            <li
              key={code.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-bg-sidebar px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-bg px-2 py-0.5 font-mono text-sm text-accent-gold">
                    {code.code}
                  </code>
                  {!code.active ? (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                      desativado
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {code.label ? `${code.label} · ` : ''}
                  {code.redemptionCount}
                  {code.maxRedemptions ? `/${code.maxRedemptions}` : ''} usos
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyLink(code)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent-gold hover:text-accent-gold"
                >
                  {copied === code.id ? 'Copiado ✓' : 'Copiar link'}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500"
                >
                  {code.active ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

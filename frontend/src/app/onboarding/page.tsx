'use client';

import { useState } from 'react';
import {
  type CreatedClone,
  type ImportResult,
  createClone,
  generatePersona,
  importInstagram,
  parseInstagramHandle,
} from '../../lib/onboarding';
import { useSession } from '../../lib/useSession';

type Step = 'name' | 'connect' | 'done';

export default function OnboardingPage() {
  const { status, accessToken } = useSession();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [igUrl, setIgUrl] = useState('');
  const [clone, setClone] = useState<CreatedClone | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Importando seus posts…');
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <Centered>Carregando…</Centered>;
  if (status === 'anon') {
    return (
      <Centered>
        <p className="text-sm text-zinc-400">Entre para criar a sua mente digital.</p>
        <a href="/login" className="mt-3 inline-block text-sm text-accent-gold underline">
          Entrar
        </a>
      </Centered>
    );
  }

  async function submitName() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createClone(name.trim(), niche.trim() || undefined, accessToken);
      setClone(created);
      setStep('connect');
    } catch {
      setError('Não consegui criar o clone. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function submitInstagram() {
    if (!clone || busy) return;
    const handle = parseInstagramHandle(igUrl);
    if (!handle) {
      setError('Informe uma URL ou @ do Instagram válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setBusyLabel('Importando seus posts…');
      const result = await importInstagram(clone.slug, handle, accessToken);
      setImported(result);
      // Train the voice from what we just imported (best-effort).
      setBusyLabel('Treinando a persona…');
      await generatePersona(clone.slug, accessToken);
      setStep('done');
    } catch {
      setError('Não consegui importar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-6 py-12">
      <Steps step={step} />

      {step === 'name' && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Crie sua mente digital</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Toda mente digital representa uma pessoa real. Comece pelo nome.
            </p>
          </div>
          <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: Fausto Bassan" />
          <Input
            label="Nicho (opcional)"
            value={niche}
            onChange={setNiche}
            placeholder="Ex.: geopolítica, fé, empreendedorismo"
          />
          <PrimaryButton onClick={submitName} disabled={busy || !name.trim()}>
            {busy ? 'Criando…' : 'Continuar'}
          </PrimaryButton>
        </section>
      )}

      {step === 'connect' && clone && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Conecte seu Instagram</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Cole a URL do seu perfil público — vamos importar seus posts e treinar{' '}
              {clone.displayName}.
            </p>
          </div>
          <Input
            label="URL do Instagram"
            value={igUrl}
            onChange={setIgUrl}
            placeholder="https://www.instagram.com/seuperfil"
          />
          <PrimaryButton onClick={submitInstagram} disabled={busy || !igUrl.trim()}>
            {busy ? busyLabel : 'Importar e treinar'}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => setStep('done')}
            disabled={busy}
            className="text-sm text-zinc-500 underline transition hover:text-zinc-300 disabled:opacity-40"
          >
            Pular por enquanto
          </button>
        </section>
      )}

      {step === 'done' && clone && (
        <section className="flex flex-col gap-4 text-center">
          <h1 className="text-2xl font-semibold">{clone.displayName} está pronto 🎉</h1>
          {imported ? (
            <p className="text-sm text-zinc-400">
              Importei <strong className="text-zinc-200">{imported.docs.inserted}</strong> posts do
              Instagram em <strong className="text-zinc-200">{imported.chunks.created}</strong>{' '}
              trechos indexados.
            </p>
          ) : (
            <p className="text-sm text-zinc-400">
              Você pode conectar fontes a qualquer momento no Studio.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2">
            <a
              href={`/c/${clone.slug}/chat`}
              className="rounded-2xl bg-accent-gold px-5 py-3 text-sm font-semibold text-accent transition hover:opacity-90"
            >
              Conversar com {clone.displayName}
            </a>
            <a
              href={`/studio/${clone.slug}`}
              className="rounded-2xl border border-zinc-700 px-5 py-3 text-sm text-zinc-300 transition hover:border-accent-gold"
            >
              Abrir o Studio
            </a>
          </div>
        </section>
      )}

      {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
    </main>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ['name', 'connect', 'done'];
  const active = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2">
      {order.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 w-10 rounded-full ${i <= active ? 'bg-accent-gold' : 'bg-zinc-700'}`}
        />
      ))}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-accent-gold focus:outline-none"
      />
    </label>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl bg-accent-gold px-5 py-3 text-sm font-semibold text-accent transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center text-sm text-zinc-300">
      {children}
    </main>
  );
}

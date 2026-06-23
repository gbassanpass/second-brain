export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Second Brain</h1>
      <p className="text-center text-zinc-400">
        Mentes digitais de criadores. Em construção — comece pelo clone do Fausto.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a
          href="/onboarding"
          className="rounded-2xl bg-accent-gold px-6 py-3 text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Criar minha mente digital
        </a>
        <a
          href="/c/fausto"
          className="rounded-2xl border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-200 transition hover:border-accent-gold"
        >
          Ver o clone do Fausto
        </a>
      </div>
    </main>
  );
}

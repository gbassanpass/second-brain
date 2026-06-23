export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Second Brain</h1>
      <p className="text-center text-zinc-400">
        Mentes digitais de criadores. Em construção — comece pelo clone do Fausto.
      </p>
      <a
        href="/c/fausto"
        className="rounded-2xl bg-accent px-6 py-3 text-sm font-medium text-zinc-100 transition hover:opacity-90"
      >
        Entrar no clone do Fausto
      </a>
    </main>
  );
}

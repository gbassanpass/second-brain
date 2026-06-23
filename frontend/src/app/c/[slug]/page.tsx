type Params = { slug: string };

export default function CreatorLandingPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-gold" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold">{params.slug}</h1>
          <p className="text-xs uppercase tracking-wide text-zinc-400">mente digital</p>
        </div>
      </header>
      <p className="text-zinc-300">
        Esta é uma landing temporária. As telas reais chegam no épico E6.
      </p>
      <p className="text-xs text-zinc-500">
        Conteúdo educativo, não é recomendação de investimento.
      </p>
    </main>
  );
}

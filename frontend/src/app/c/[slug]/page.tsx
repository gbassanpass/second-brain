import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchCreator } from '../../../lib/api';
import { buildLandingView } from '../../../lib/creator';

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const creator = await fetchCreator(params.slug);
  if (!creator) return { title: 'Criador não encontrado' };
  const view = buildLandingView(creator);
  return {
    title: `${view.displayName} · mente digital`,
    description: view.tagline,
  };
}

export default async function CreatorLandingPage({ params }: { params: Params }) {
  const creator = await fetchCreator(params.slug);
  if (!creator) notFound();
  const view = buildLandingView(creator);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-gold text-lg font-semibold text-accent"
          aria-hidden
        >
          {view.initials}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{view.displayName}</h1>
          <p className="text-xs font-medium uppercase tracking-wide text-accent-gold">
            mente digital
          </p>
        </div>
      </header>

      <p className="mt-8 text-lg leading-relaxed text-zinc-200">{view.tagline}</p>

      <section className="mt-10" aria-labelledby="exemplos">
        <h2 id="exemplos" className="text-sm font-medium text-zinc-400">
          Experimente perguntar
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {view.exampleQuestions.map((q) => (
            <li
              key={q}
              className="rounded-2xl border border-zinc-700 bg-bg-assistant px-4 py-3 text-sm text-zinc-200"
            >
              {q}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10">
        <a
          href={view.chatHref}
          className="inline-flex items-center justify-center rounded-2xl bg-accent-gold px-6 py-3 text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Conversar com {view.displayName}
        </a>
      </div>

      <footer className="mt-auto pt-12">
        <p className="text-xs leading-relaxed text-zinc-500">{view.disclaimer}</p>
      </footer>
    </main>
  );
}

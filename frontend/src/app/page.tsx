import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'falacomigo.ai — crie a sua mente digital',
  description:
    'Conecte seu conteúdo e tenha um clone de IA que conversa com a sua audiência no seu estilo, citando suas fontes. Para criadores brasileiros.',
};

export default function HomePage() {
  return (
    <div className="bg-bg text-zinc-100">
      <NavBar />
      <Hero />
      <HowItWorks />
      <Features />
      <DemoCallout />
      <FinalCta />
      <Footer />
    </div>
  );
}

function NavBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800/70 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-gold text-accent">
            ◆
          </span>
          falacomigo.ai
        </span>
        <div className="flex items-center gap-3 text-sm">
          <a href="/login" className="text-zinc-400 transition hover:text-zinc-100">
            Entrar
          </a>
          <a
            href="/signup"
            className="rounded-xl bg-accent-gold px-4 py-2 font-semibold text-accent transition hover:opacity-90"
          >
            Criar minha mente digital
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* glow */}
      <div className="-z-10 pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-accent-gold/15 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div>
          <span className="inline-flex items-center rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
            Para criadores brasileiros
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Crie a sua <span className="text-accent-gold">mente digital</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-300">
            Conecte seu conteúdo e tenha um clone de IA que conversa com a sua audiência no seu
            estilo, <strong className="text-zinc-100">24/7</strong> — sempre citando as suas fontes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/signup"
              className="rounded-2xl bg-accent-gold px-6 py-3 text-center text-sm font-semibold text-accent transition hover:opacity-90"
            >
              Criar minha mente digital
            </a>
            <a
              href="/c/fausto"
              className="rounded-2xl border border-zinc-700 px-6 py-3 text-center text-sm font-medium text-zinc-200 transition hover:border-accent-gold"
            >
              Ver uma ao vivo →
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Sem fine-tuning. Sem código. Comece colando a URL do seu Instagram.
          </p>
        </div>
        <ChatPreview />
      </div>
    </section>
  );
}

/** A static mock of the product's chat — sells the experience. */
function ChatPreview() {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-bg-sidebar p-5 shadow-2xl">
      <div className="flex items-center gap-3 border-zinc-800 border-b pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-gold font-semibold text-accent text-sm">
          FB
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">Fausto Bassan</p>
          <p className="font-medium text-[11px] text-accent-gold uppercase tracking-wide">
            mente digital
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4">
        <div className="self-end rounded-xl bg-bg-assistant px-3.5 py-2 text-[13px] text-zinc-100">
          Por que o Trump quer anexar a Groenlândia?
        </div>
        <div className="rounded-xl bg-bg-assistant px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-200">
          A mídia aponta as terras raras, mas o interesse real é geopolítico: controlar rotas do
          Ártico antes da China.{' '}
          <span className="text-accent-gold">
            Antes de escolher um vilão, pergunte quem ganha o quê.
          </span>
          <span className="mt-2 block">
            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
              de: Reel @faustobassan
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Conecte seu conteúdo',
      body: 'Cole a URL do seu Instagram (YouTube em breve). Importamos seus posts automaticamente — sem login, sem upload manual.',
    },
    {
      n: '2',
      title: 'Treine sua mente digital',
      body: 'A IA aprende seu estilo, seus temas e seus bordões a partir do que você já publicou.',
    },
    {
      n: '3',
      title: 'Converse com sua audiência',
      body: 'Seu clone responde no seu tom, citando suas fontes, a qualquer hora. Você acompanha tudo no Studio.',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-2xl font-semibold md:text-3xl">Como funciona</h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-zinc-800 bg-bg-sidebar p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-gold/15 font-semibold text-accent-gold">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      title: 'Cita as fontes',
      body: 'Cada resposta aponta de qual conteúdo seu ela veio. Sem invenção: se não está no seu material, o clone diz que não sabe.',
    },
    {
      title: 'No seu estilo',
      body: 'Tom, frameworks e bordões aprendidos do seu próprio conteúdo — não um chatbot genérico.',
    },
    {
      title: 'Seguro por padrão',
      body: 'Guardrails embutidos: nada de recomendação de investimento, sem fingir ser você. Sempre "mente digital".',
    },
    {
      title: 'Studio do criador',
      body: 'Edite sua persona, veja as fontes indexadas e acompanhe conversas, custo e perguntas mais frequentes.',
    },
  ];
  return (
    <section className="border-zinc-800/70 border-y bg-bg-sidebar/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold md:text-3xl">Feito para confiança</h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
          {items.map((f) => (
            <div key={f.title} className="bg-bg p-6">
              <h3 className="font-semibold text-accent-gold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoCallout() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="rounded-3xl border border-zinc-800 bg-bg-sidebar p-8 text-center md:p-12">
        <p className="text-sm text-zinc-400">Primeira mente digital no ar</p>
        <h2 className="mt-2 text-2xl font-semibold md:text-3xl">
          Converse com a mente digital do <span className="text-accent-gold">Fausto Bassan</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          Geopolítica e atualidade, sem torcer. Treinada com o conteúdo real dele.
        </p>
        <a
          href="/c/fausto"
          className="mt-6 inline-block rounded-2xl border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-100 transition hover:border-accent-gold"
        >
          Abrir o chat do Fausto →
        </a>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-zinc-800/70 border-t">
      <div className="-z-10 pointer-events-none absolute inset-0">
        <div className="absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-accent-gold/10 blur-3xl" />
      </div>
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Sua audiência, atendida no seu estilo — 24/7
        </h2>
        <p className="mt-4 text-zinc-400">Crie a sua mente digital em minutos.</p>
        <a
          href="/signup"
          className="mt-8 inline-block rounded-2xl bg-accent-gold px-8 py-4 text-sm font-semibold text-accent transition hover:opacity-90"
        >
          Criar minha mente digital
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-zinc-800/70 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-10 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© 2026 falacomigo.ai</span>
        <span className="max-w-md sm:text-right">
          Você conversa com a mente digital do criador, não com a pessoa real. Conteúdo educativo;
          não é recomendação de investimento.
        </span>
      </div>
    </footer>
  );
}

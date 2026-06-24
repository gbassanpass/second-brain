import type { Metadata } from 'next';
import { LandingGraph } from '../components/LandingGraph';
import { Reveal } from '../components/Reveal';
import { UseCases } from '../components/UseCases';
import {
  IconAudience,
  IconConversations,
  IconInsights,
  IconInstagram,
  IconKnowledge,
  IconMind,
  IconPersona,
  IconPlay,
  IconTiktok,
  IconYoutube,
} from '../components/icons';

export const metadata: Metadata = {
  title: 'falacomigo.ai — crie a sua mente digital',
  description:
    'Conecte seu conteúdo e tenha um clone de IA que conversa com a sua audiência no seu estilo e na sua voz, citando suas fontes. Para criadores brasileiros.',
};

const DEMO = '/c/fausto-bassan/chat';

// Bar heights for the voice waveform mock (stable ids → not index keys).
const WAVE = [10, 22, 14, 30, 18, 26, 12, 28, 16, 24, 10, 20, 14, 30, 18].map((h, i) => ({
  id: `wave-${i}`,
  h,
}));

export default function HomePage() {
  return (
    <div className="bg-bg text-zinc-100">
      <NavBar />
      <Hero />
      <TrustBar />
      <Reveal>
        <Connectors />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <VoiceSpotlight />
      </Reveal>
      <Reveal>
        <UseCases />
      </Reveal>
      <Reveal>
        <MindSpotlight />
      </Reveal>
      <Reveal>
        <InsightsSpotlight />
      </Reveal>
      <Reveal>
        <SocialProof />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Pricing />
      </Reveal>
      <Reveal>
        <TrustSection />
      </Reveal>
      <Reveal>
        <FinalCta />
      </Reveal>
      <Footer />
    </div>
  );
}

function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/70 bg-bg/80 backdrop-blur">
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
      <div className="-z-10 pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-accent-gold/15 blur-3xl" />
        <div className="absolute top-40 right-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" /> Para criadores brasileiros
          </span>
          <h1 className="mt-5 font-display text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
            Crie a versão de você que <span className="italic text-accent-gold">não para</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-300">
            Conecte seu conteúdo e tenha um clone de IA que fala com a sua audiência no seu estilo e
            na <strong className="text-zinc-100">sua voz</strong> — sempre citando as suas fontes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/signup"
              className="rounded-2xl bg-accent-gold px-6 py-3 text-center text-sm font-semibold text-accent transition hover:opacity-90"
            >
              Criar minha mente digital
            </a>
            <a
              href={DEMO}
              className="rounded-2xl border border-zinc-700 px-6 py-3 text-center text-sm font-medium text-zinc-200 transition hover:border-accent-gold"
            >
              Ver uma ao vivo →
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Sem fine-tuning. Sem código. Comece colando a URL do seu Instagram.
          </p>
        </div>
        <div className="relative">
          <div className="relative z-10">
            <ChatPreview />
          </div>
          {/* Floating question bubbles — in front, around the card edges */}
          <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
            <span className="animate-floaty absolute -left-10 -top-5 rounded-2xl border border-zinc-700 bg-bg-sidebar px-3 py-1.5 text-xs text-zinc-300 shadow-xl">
              O que você acha das eleições?
            </span>
            <span
              className="animate-floaty absolute -right-8 top-1/2 rounded-2xl border border-zinc-700 bg-bg-sidebar px-3 py-1.5 text-xs text-zinc-300 shadow-xl"
              style={{ animationDelay: '1.5s' }}
            >
              🔊 me explica em áudio
            </span>
            <span
              className="animate-floaty absolute -bottom-6 left-6 rounded-2xl border border-zinc-700 bg-bg-sidebar px-3 py-1.5 text-xs text-zinc-300 shadow-xl"
              style={{ animationDelay: '3s' }}
            >
              como você pensaria sobre isso?
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Static mock of the product chat — citation pill, source, voice. */
function ChatPreview() {
  return (
    <div className="relative rounded-3xl border border-zinc-800 bg-bg-sidebar p-5 shadow-2xl">
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
          Ártico antes da China
          <span className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-gold/20 px-1 align-super text-[9px] font-semibold text-accent-gold">
            1
          </span>
          .{' '}
          <span className="text-accent-gold">
            Antes de escolher um vilão, pergunte quem ganha o quê.
          </span>
          <span className="mt-2 flex items-center gap-2">
            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
              de: Reel @faustobassan ↗
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
              🔊 Ouvir
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function TrustBar() {
  const items = ['Cita as fontes', 'Fala na sua voz', 'Guardrail anti-CVM', 'Sem fine-tuning'];
  return (
    <div className="border-zinc-800/70 border-y bg-bg-sidebar/30">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4 text-xs text-zinc-500">
        {items.map((i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-accent-gold">✓</span> {i}
          </span>
        ))}
      </div>
    </div>
  );
}

function Features() {
  const items = [
    {
      Icon: IconConversations,
      title: 'Chat que cita fontes',
      body: 'Cada resposta aponta de qual conteúdo seu ela veio. Se não está no seu material, o clone diz que não sabe — sem inventar.',
    },
    {
      Icon: IconPersona,
      title: 'Voz e estilo seus',
      body: 'Tom, frameworks e bordões aprendidos do seu conteúdo. Respostas faladas com a sua voz clonada (ElevenLabs).',
    },
    {
      Icon: IconMind,
      title: 'Mente 3D + Knowledge Graph',
      body: 'A plataforma mapeia COMO você pensa — princípios e conexões — e mostra sua mente num grafo 3D navegável.',
    },
    {
      Icon: IconInsights,
      title: 'Insights que viram pauta',
      body: 'Veja o que sua audiência mais pergunta e o que seu clone não soube responder — e gere roteiros de conteúdo num clique.',
    },
    {
      Icon: IconAudience,
      title: 'Acesso e monetização',
      body: 'Paywall por assinatura, códigos de acesso para pilotos e a lista de quem entrou e conversou.',
    },
    {
      Icon: IconKnowledge,
      title: 'Você no controle',
      body: 'Treine respostas, ajuste a persona e regule o quanto o clone pode inferir além do que você já disse.',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
        Tudo que a sua mente digital faz
      </h2>
      <p className="mt-2 max-w-xl text-sm text-zinc-400">
        Não é um chatbot genérico. É um clone treinado no seu conteúdo, fiel ao seu jeito de pensar.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-zinc-800 bg-bg-sidebar p-6 transition hover:border-accent-gold/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-gold">
              <f.Icon />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Spotlight for the 3D mind + knowledge graph (visual differentiator). */
function MindSpotlight() {
  return (
    <section className="border-zinc-800/70 border-y bg-bg-sidebar/40">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
            Knowledge graph
          </span>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-tight md:text-3xl">
            Não copiamos só o que você diz. Modelamos como você pensa.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
            Um grafo de conhecimento extrai seus princípios e heurísticas do seu conteúdo. Quando
            chega uma pergunta inédita, o clone raciocina a partir do seu jeito de pensar — e você
            explora tudo numa visualização 3D da sua mente.
          </p>
          <a
            href={DEMO}
            className="mt-6 inline-block rounded-2xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-accent-gold"
          >
            Ver uma mente ao vivo →
          </a>
        </div>
        <LandingGraph />
      </div>
    </section>
  );
}

function InsightsSpotlight() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
      <div className="order-2 rounded-3xl border border-zinc-800 bg-bg-sidebar p-5 md:order-1">
        <p className="text-xs font-medium text-zinc-500">✨ Pautas sugeridas</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="rounded-xl border border-zinc-800 bg-bg p-3">
            <p className="text-sm font-medium text-zinc-100">Stablecoins ameaçam a poupança?</p>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400">
                lacuna
              </span>{' '}
              perguntado 3× e seu clone não soube responder
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-bg p-3">
            <p className="text-sm font-medium text-zinc-100">Como você decide na incerteza</p>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">demanda</span>{' '}
              tema mais frequente da semana
            </p>
          </div>
        </div>
      </div>
      <div className="order-1 md:order-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
          Insights
        </span>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-tight md:text-3xl">
          Descubra o que postar a seguir
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
          O Studio mostra o que sua audiência mais pergunta e onde faltou resposta — e transforma
          isso em pautas com roteiro pronto. Pare de adivinhar o próximo conteúdo: deixe a sua
          audiência dizer.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Conecte seu conteúdo',
      body: 'Cole a URL do seu Instagram. Importamos seus posts automaticamente — sem login, sem upload manual.',
    },
    {
      n: '2',
      title: 'Treine sua mente digital',
      body: 'A IA aprende seu estilo, seus temas e seus princípios a partir do que você já publicou.',
    },
    {
      n: '3',
      title: 'Converse e monetize',
      body: 'Seu clone responde no seu tom 24/7. Libere por assinatura ou código e acompanhe tudo no Studio.',
    },
  ];
  return (
    <section className="border-zinc-800/70 border-y bg-bg-sidebar/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-2xl font-medium md:text-3xl">Como funciona</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-zinc-800 bg-bg p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-gold/15 font-semibold text-accent-gold">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  // NOTE: depoimentos ilustrativos — trocar por reais quando houver.
  const quotes = [
    {
      quote:
        'Minha audiência conversa comigo a qualquer hora, no meu tom — e eu vejo exatamente o que eles querem saber.',
      name: 'Fausto Bassan',
      role: 'Geopolítica e atualidade',
      initials: 'FB',
      pilot: true,
    },
    {
      quote:
        'As "pautas sugeridas" viraram minha fila de conteúdo. Paro de adivinhar o próximo vídeo.',
      name: 'Criadora de finanças',
      role: 'Piloto',
      initials: 'C',
    },
    {
      quote:
        'Subir um clone que cita minhas fontes e não inventa nada mudou a confiança da galera.',
      name: 'Criador de educação',
      role: 'Piloto',
      initials: 'E',
    },
  ];
  return (
    <section className="border-zinc-800/70 border-y bg-bg-sidebar/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
          Quem já está no ar
        </span>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-tight md:text-3xl">
          Mentes digitais que conversam de verdade
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {quotes.map((q) => (
            <figure
              key={q.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                q.pilot ? 'border-accent-gold/40 bg-accent-gold/5' : 'border-zinc-800 bg-bg'
              }`}
            >
              <blockquote className="flex-1 text-sm leading-relaxed text-zinc-200">
                “{q.quote}”
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-gold text-xs font-semibold text-accent">
                  {q.initials}
                </span>
                <span>
                  <span className="block text-sm font-medium text-zinc-100">{q.name}</span>
                  <span className="block text-xs text-zinc-500">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  // NOTE: preços ilustrativos da Fase 2 — confirmar antes de publicar.
  const tiers = [
    {
      name: 'Grátis',
      price: 'R$ 0',
      cadence: '',
      cta: 'Começar grátis',
      highlight: false,
      features: [
        '1 mente digital',
        'Chat que cita as fontes',
        'Até 100 mensagens/mês',
        'Studio com Insights básicos',
      ],
    },
    {
      name: 'Criador',
      price: 'R$ 49',
      cadence: '/mês',
      cta: 'Assinar Criador',
      highlight: true,
      features: [
        'Conversas ilimitadas',
        'Resposta falada (voz)',
        'Insights + pautas com roteiro',
        'Códigos de acesso e audiência',
      ],
    },
    {
      name: 'Pro',
      price: 'R$ 149',
      cadence: '/mês',
      cta: 'Assinar Pro',
      highlight: false,
      features: [
        'Tudo do Criador',
        'Voz clonada (PVC)',
        'Mente 3D + knowledge graph',
        'Prioridade de modelo + branding',
      ],
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center font-display text-2xl font-medium tracking-tight md:text-3xl">
        Planos para cada fase
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
        Comece de graça e evolua quando sua audiência crescer.
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`relative flex flex-col rounded-3xl border p-6 ${
              t.highlight
                ? 'border-accent-gold bg-accent-gold/5 shadow-2xl md:-translate-y-2'
                : 'border-zinc-800 bg-bg-sidebar'
            }`}
          >
            {t.highlight ? (
              <span className="-top-3 absolute left-6 rounded-full bg-accent-gold px-3 py-0.5 text-[11px] font-semibold text-accent">
                Mais popular
              </span>
            ) : null}
            <p className="text-sm font-medium text-zinc-300">{t.name}</p>
            <p className="mt-2">
              <span className="text-3xl font-semibold text-zinc-100">{t.price}</span>
              <span className="text-sm text-zinc-500">{t.cadence}</span>
            </p>
            <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-zinc-300">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent-gold">✓</span> {f}
                </li>
              ))}
            </ul>
            <a
              href="/signup"
              className={`mt-6 rounded-2xl px-5 py-3 text-center text-sm font-semibold transition ${
                t.highlight
                  ? 'bg-accent-gold text-accent hover:opacity-90'
                  : 'border border-zinc-700 text-zinc-100 hover:border-accent-gold'
              }`}
            >
              {t.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function Connectors() {
  const channels = [
    { Icon: IconInstagram, name: 'Instagram', status: 'ativo' },
    { Icon: IconYoutube, name: 'YouTube', status: 'em breve' },
    { Icon: IconTiktok, name: 'TikTok', status: 'em breve' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
        Conecte suas redes
      </p>
      <h2 className="mt-2 font-display text-2xl font-medium tracking-tight md:text-3xl">
        Lemos o seu conteúdo — você não digita nada
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
        Cole o link do seu perfil e importamos seus posts automaticamente. Sem upload manual, sem
        login das suas redes.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        {channels.map((ch, i) => (
          <div
            key={ch.name}
            className="animate-floaty flex w-32 flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-bg-sidebar px-4 py-5"
            style={{ animationDelay: `${i * 0.6}s` }}
          >
            <ch.Icon className="text-zinc-200" />
            <span className="text-sm text-zinc-200">{ch.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                ch.status === 'ativo'
                  ? 'bg-accent-gold/15 text-accent-gold'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {ch.status}
            </span>
          </div>
        ))}
        <span className="text-2xl text-zinc-600">→</span>
        <div className="flex w-32 flex-col items-center gap-2 rounded-2xl border border-accent-gold/40 bg-accent-gold/5 px-4 py-5">
          <span className="text-accent-gold">
            <IconMind />
          </span>
          <span className="text-sm font-medium text-zinc-100">sua mente</span>
          <span className="rounded-full bg-accent-gold px-2 py-0.5 text-[10px] font-semibold text-accent">
            pronta
          </span>
        </div>
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Também aceita texto, Q&A e arquivos — adicione conhecimento a qualquer momento.
      </p>
    </section>
  );
}

function VoiceSpotlight() {
  return (
    <section className="border-zinc-800/70 border-y bg-bg-sidebar/40">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
            Voz
          </span>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-tight md:text-3xl">
            A sua voz — não uma voz genérica
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
            O clone responde por áudio com a sua voz clonada. Voz retém ~5× mais que texto: sua
            audiência ouve você, mesmo quando você não está.
          </p>
        </div>
        {/* Voice player mock with animated waveform */}
        <div className="flex items-center gap-4 rounded-3xl border border-zinc-800 bg-black p-6 shadow-xl">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-gold text-accent">
            <IconPlay width={20} height={20} />
          </span>
          <div className="flex flex-1 items-end gap-1" aria-hidden>
            {WAVE.map((bar, i) => (
              <span
                key={bar.id}
                className="animate-floaty w-1.5 rounded-full bg-accent-gold/70"
                style={{
                  height: `${bar.h}px`,
                  animationDelay: `${i * 0.12}s`,
                  animationDuration: '1.6s',
                }}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs text-zinc-500">0:12</span>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const items = [
    {
      title: 'Sem alucinação',
      body: 'Responde só com base no seu conteúdo. Sem material, ele diz "não tenho isso registrado".',
    },
    {
      title: 'Conformidade BR',
      body: 'Guardrail anti-recomendação de investimento (CVM) embutido em toda resposta. Não é opcional.',
    },
    {
      title: 'Sem enganar',
      body: 'Fica sempre claro que é a "mente digital" do criador — nunca finge ser a pessoa real.',
    },
    {
      title: 'Só de si mesmo',
      body: 'Você só clona a si mesmo, com consentimento. Nunca raspamos conteúdo de terceiros.',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="font-display text-2xl font-medium md:text-3xl">Confiança em primeiro lugar</h2>
      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
        {items.map((f) => (
          <div key={f.title} className="bg-bg p-6">
            <h3 className="font-semibold text-accent-gold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
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
        <h2 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
          Sua audiência, atendida no seu estilo — 24/7
        </h2>
        <p className="mt-4 text-zinc-400">Crie a sua mente digital em minutos.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/signup"
            className="rounded-2xl bg-accent-gold px-8 py-4 text-sm font-semibold text-accent transition hover:opacity-90"
          >
            Criar minha mente digital
          </a>
          <a
            href={DEMO}
            className="rounded-2xl border border-zinc-700 px-8 py-4 text-sm font-medium text-zinc-200 transition hover:border-accent-gold"
          >
            Conversar com o Fausto →
          </a>
        </div>
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

'use client';

import { useState } from 'react';

interface UseCase {
  id: string;
  label: string;
  headline: string;
  body: string;
  question: string;
  answer: string;
}

const CASES: UseCase[] = [
  {
    id: 'geopolitica',
    label: 'Geopolítica',
    headline: 'Análise sem torcer, a qualquer hora',
    body: 'Sua audiência pergunta sobre o conflito do dia e recebe a sua leitura — com as suas fontes, no seu tom.',
    question: 'Por que o Trump quer a Groenlândia?',
    answer:
      'O interesse real é geopolítico: controlar as rotas do Ártico antes da China. Pergunte sempre quem ganha o quê. [1]',
  },
  {
    id: 'financas',
    label: 'Finanças',
    headline: 'Educação, nunca recomendação',
    body: 'Explica conceitos e cenários com o seu framework — com guardrail anti-CVM embutido em toda resposta.',
    question: 'Vale a pena investir em stablecoins?',
    answer:
      'Mais importante que “comprar ou não”: entenda o risco sistêmico e quem se beneficia do fluxo. Conteúdo educativo. [2]',
  },
  {
    id: 'educacao',
    label: 'Educação',
    headline: 'Seu método, escalado para milhares',
    body: 'Cada aluno tira dúvidas com a sua didática — e você vê onde todos travam para criar a próxima aula.',
    question: 'Como começo a estudar isso do zero?',
    answer: 'Comece pelo conceito-base e construa em camadas. Aqui está o caminho que eu sigo… [1]',
  },
  {
    id: 'negocios',
    label: 'Negócios',
    headline: 'Seus frameworks, disponíveis 24/7',
    body: 'Sua mentoria responde no seu jeito de decidir — e converte audiência em clientes pelo paywall ou código.',
    question: 'Como você precificaria um produto novo?',
    answer:
      'Não precifique o produto — precifique o resultado que ele entrega. Foi assim que eu pensei em… [3]',
  },
];

/** Interactive use-case tabs — pick an audience, see the clone in action. */
export function UseCases() {
  const [active, setActive] = useState(CASES[0]?.id ?? 'geopolitica');
  const current = CASES.find((c) => c.id === active) ?? CASES[0];
  if (!current) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-gold">Casos de uso</p>
      <h2 className="mt-2 font-display text-3xl font-medium tracking-tight md:text-4xl">
        Feito para o seu nicho
      </h2>

      <div className="mt-8 flex flex-wrap gap-2">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              active === c.id
                ? 'bg-accent-gold text-accent'
                : 'border border-zinc-700 text-zinc-300 hover:border-zinc-500'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid items-center gap-10 md:grid-cols-2">
        <div>
          <h3 className="font-display text-2xl font-medium md:text-3xl">{current.headline}</h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">{current.body}</p>
        </div>
        {/* Mini chat preview that swaps with the tab */}
        <div className="rounded-3xl border border-zinc-800 bg-bg-sidebar p-5 shadow-xl">
          <div className="flex flex-col gap-3">
            <div className="self-end rounded-xl bg-bg-assistant px-3.5 py-2 text-[13px] text-zinc-100">
              {current.question}
            </div>
            <div className="rounded-xl bg-bg-assistant px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-200">
              {current.answer}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

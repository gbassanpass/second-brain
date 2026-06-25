/**
 * Smalltalk detection (A). Greetings, "tudo bem?", thanks, farewells and
 * identity questions are social turns — they should be answered in persona,
 * NOT routed through factual retrieval (which would refuse with "não tenho isso
 * registrado"). Kept conservative: only short messages match, so a real
 * question that merely opens with "bom dia, …" still goes to retrieval.
 */

import type { LLMClient } from '../llm/base.js';

// Lookarounds on \p{L} (any letter, accents included) act as word boundaries
// that — unlike \b — work at accented edges ("olá") and still avoid matching
// inside a larger word ("coisa" must not match "oi").
const GREETING =
  /(?<!\p{L})(oi+|ol[áa]|al[ôo]|e a[íi]|eai|salve|bom dia|boa tarde|boa noite|tudo bem|tudo bom|tudo certo|como vai|como (voc[êe]|vc) (est[áa]|ta)|beleza|de boa|suave)(?!\p{L})/iu;
const THANKS = /(?<!\p{L})(obrigad[oa]|valeu|vlw|agrade[çc]o|grato|grata)(?!\p{L})/iu;
const FAREWELL =
  /(?<!\p{L})(tchau|at[ée] mais|at[ée] logo|at[ée] breve|falou|fui|abra[çc]o)(?!\p{L})/iu;
const IDENTITY =
  /(?<!\p{L})(quem [ée] (voc[êe]|vc)|qual (o )?(seu|teu) nome|(voc[êe]|vc) [ée] (real|humano|de verdade|uma? (ia|rob[ôo]|m[áa]quina))|com quem (eu )?(falo|estou falando))(?!\p{L})/iu;

/** Max words for a message to still count as smalltalk (avoids swallowing real questions). */
const MAX_WORDS = 8;

export function isSmalltalk(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (q.split(/\s+/).length > MAX_WORDS) return false;
  return GREETING.test(q) || THANKS.test(q) || FAREWELL.test(q) || IDENTITY.test(q);
}

/**
 * LLM fallback classifier — generalizes beyond the regex list. Used ONLY when
 * retrieval found nothing (no_context): is this a social message the fast-path
 * missed (e.g. "e aí, firmeza?", "qdb?"), or a real factual question? A precise
 * social/factual call here keeps us from refusing a novel greeting while still
 * refusing/extrapolating on genuine questions. Fails closed (false) on error,
 * so an outage degrades to the safe refusal path, never to a hallucination.
 */
export async function looksSocial(llm: LLMClient, query: string, model: string): Promise<boolean> {
  try {
    const res = await llm.complete({
      model,
      system: 'Você é um classificador de intenção. Responda com UMA palavra apenas.',
      messages: [
        {
          role: 'user',
          content: [
            'A mensagem é apenas SOCIAL (saudação, "como vai", "tudo bem", elogio,',
            'agradecimento, despedida, ou perguntar quem você é) — ou é uma pergunta',
            'FACTUAL sobre algum tema/assunto/opinião?',
            '',
            `Mensagem: "${query.trim()}"`,
            '',
            'Responda só: social OU factual',
          ].join('\n'),
        },
      ],
      maxTokens: 5,
    });
    const out = res.content.toLowerCase();
    return out.includes('social') && !out.includes('factual');
  } catch {
    return false;
  }
}

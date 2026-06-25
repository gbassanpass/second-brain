/**
 * Smalltalk detection (A). Greetings, "tudo bem?", thanks, farewells and
 * identity questions are social turns — they should be answered in persona,
 * NOT routed through factual retrieval (which would refuse with "não tenho isso
 * registrado"). Kept conservative: only short messages match, so a real
 * question that merely opens with "bom dia, …" still goes to retrieval.
 */

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

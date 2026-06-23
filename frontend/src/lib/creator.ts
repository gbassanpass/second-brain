/**
 * Public creator profile returned by `GET /api/creators/:slug` (backend E6.1).
 * Keep this shape in sync with `backend/src/services/creator.ts::PublicCreator`.
 */
export interface PublicCreator {
  slug: string;
  displayName: string;
  niche: string | null;
  oneLiner: string | null;
  disclaimer: string | null;
}

/**
 * Fallback disclaimer. It leads with the "mente digital" notice (CLAUDE.md §6 —
 * never let the visitor think they're talking to the real person) and folds in
 * the CVM educational caveat. Used when the creator has no Persona disclaimer.
 */
export const DEFAULT_DISCLAIMER =
  'Você conversa com a mente digital do criador, não com a pessoa real. ' +
  'Conteúdo educativo; não é recomendação de investimento.';

/**
 * Creator-agnostic suggestion chips. Intentionally generic so the landing works
 * for any creator before per-creator examples exist (a Persona field for these
 * is a later task). They map onto the doc-11 EmptyState idea: a "what do you
 * talk about", a "neutral take", and a "life decision" prompt.
 */
export const EXAMPLE_QUESTIONS: readonly string[] = [
  'Sobre o que você mais gosta de conversar?',
  'Me explica um tema atual sem torcer pra nenhum lado.',
  'Estou diante de uma decisão difícil — como você pensaria sobre isso?',
];

export interface LandingView {
  slug: string;
  displayName: string;
  /** 1–2 letter avatar fallback. */
  initials: string;
  /** "{name} · mente digital" — the non-deception label. */
  mindLabel: string;
  /** One-line pitch: Persona one-liner, else niche, else a neutral default. */
  tagline: string;
  disclaimer: string;
  exampleQuestions: readonly string[];
  chatHref: string;
}

/** Up to two initials from a display name (e.g. "Fausto Bassan" → "FB"). */
export function initialsFor(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = (words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]])
    .map((w) => w?.[0] ?? '')
    .join('');
  return letters.toUpperCase();
}

/** Pure mapping from the API payload to everything the landing renders. */
export function buildLandingView(creator: PublicCreator): LandingView {
  const tagline =
    creator.oneLiner?.trim() ||
    (creator.niche ? `Mente digital sobre ${creator.niche}.` : 'Converse com a mente digital.');

  return {
    slug: creator.slug,
    displayName: creator.displayName,
    initials: initialsFor(creator.displayName),
    mindLabel: `${creator.displayName} · mente digital`,
    tagline,
    disclaimer: creator.disclaimer?.trim() || DEFAULT_DISCLAIMER,
    exampleQuestions: EXAMPLE_QUESTIONS,
    chatHref: `/c/${creator.slug}/chat`,
  };
}

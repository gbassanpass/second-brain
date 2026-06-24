/**
 * Studio types + pure form helpers (E6.4). Shapes mirror the backend
 * (`services/creator.ts` + `rag/persona.ts`). Transport lives in the
 * `fetch*`/`save*` functions; the form conversions are pure and tested.
 */

export interface Me {
  id: string;
  externalId: string;
  email: string | null;
  role: string;
}

export interface PersonaCard {
  name: string;
  one_liner: string;
  voice: string[];
  frameworks: string[];
  do: string[];
  dont: string[];
  catchphrases: string[];
  disclaimer?: string;
}

export interface SourceSummary {
  id: string;
  kind: string;
  status: string;
  externalRef: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface DocumentSummary {
  id: string;
  title: string | null;
  kind: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface TopQuestion {
  question: string;
  count: number;
}

export interface CreatorAnalytics {
  conversations: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalCostUsd: number;
  avgCostUsdPerAnswer: number;
  avgLatencyMs: number | null;
  guardrailInvestmentCount: number;
  guardrailRate: number;
  topQuestions: TopQuestion[];
}

/** USD with enough precision to show sub-cent per-answer costs. */
export function formatUsd(value: number): string {
  return `US$ ${value.toFixed(value < 0.1 ? 4 : 2)}`;
}

/** Fraction in [0,1] → percent string. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

/** Milliseconds → "1.2s" / "850ms"; "—" when there's no data. */
export function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** A creator/operator may use the Studio; subscribers may not. */
export function canUseStudio(role: string | undefined): boolean {
  return role === 'creator' || role === 'operator';
}

/** The Persona Card flattened into editable text fields (arrays → one-per-line). */
export interface PersonaForm {
  name: string;
  one_liner: string;
  voice: string;
  frameworks: string;
  do: string;
  dont: string;
  catchphrases: string;
  disclaimer: string;
}

function arrayToLines(items: string[]): string {
  return items.join('\n');
}

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function personaToForm(card: PersonaCard): PersonaForm {
  return {
    name: card.name,
    one_liner: card.one_liner,
    voice: arrayToLines(card.voice),
    frameworks: arrayToLines(card.frameworks),
    do: arrayToLines(card.do),
    dont: arrayToLines(card.dont),
    catchphrases: arrayToLines(card.catchphrases),
    disclaimer: card.disclaimer ?? '',
  };
}

/**
 * Rebuild a Persona Card from the form. Empty optional fields collapse away;
 * `disclaimer` is omitted when blank so we don't persist an empty string.
 */
export function formToPersona(form: PersonaForm): PersonaCard {
  const card: PersonaCard = {
    name: form.name.trim(),
    one_liner: form.one_liner.trim(),
    voice: linesToArray(form.voice),
    frameworks: linesToArray(form.frameworks),
    do: linesToArray(form.do),
    dont: linesToArray(form.dont),
    catchphrases: linesToArray(form.catchphrases),
  };
  const disclaimer = form.disclaimer.trim();
  if (disclaimer) card.disclaimer = disclaimer;
  return card;
}

/** Client-side validation mirroring the backend Zod rules (name/one_liner/voice required). */
export function personaFormError(form: PersonaForm): string | null {
  if (!form.name.trim()) return 'O nome é obrigatório.';
  if (!form.one_liner.trim()) return 'A descrição em uma linha é obrigatória.';
  if (linesToArray(form.voice).length === 0) return 'Inclua ao menos um traço de voz.';
  return null;
}

const EMPTY_FORM: PersonaForm = {
  name: '',
  one_liner: '',
  voice: '',
  frameworks: '',
  do: '',
  dont: '',
  catchphrases: '',
  disclaimer: '',
};

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function fetchMe(token: string | null): Promise<Me | null> {
  const res = await fetch('/api/me', { headers: authHeaders(token) });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}

/** Returns the persona form (empty when the creator has no card yet). */
export async function fetchPersonaForm(slug: string, token: string | null): Promise<PersonaForm> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/persona`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return { ...EMPTY_FORM };
  if (!res.ok) throw new Error(`persona load failed: ${res.status}`);
  const body = (await res.json()) as { personaCard: PersonaCard };
  return personaToForm(body.personaCard);
}

export async function savePersona(
  slug: string,
  card: PersonaCard,
  token: string | null,
): Promise<void> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/persona`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(card),
  });
  if (!res.ok) throw new Error(`persona save failed: ${res.status}`);
}

export async function fetchSources(slug: string, token: string | null): Promise<SourceSummary[]> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/sources`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`sources load failed: ${res.status}`);
  return ((await res.json()) as { sources: SourceSummary[] }).sources;
}

export async function fetchDocuments(
  slug: string,
  token: string | null,
): Promise<DocumentSummary[]> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/documents`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`documents load failed: ${res.status}`);
  return ((await res.json()) as { documents: DocumentSummary[] }).documents;
}

export async function fetchAnalytics(
  slug: string,
  token: string | null,
): Promise<CreatorAnalytics> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/analytics`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`analytics load failed: ${res.status}`);
  return (await res.json()) as CreatorAnalytics;
}

export interface ConversationSummary {
  id: string;
  firstQuestion: string | null;
  messageCount: number;
  lastActivity: string | null;
  createdAt: string;
}

export interface ConversationMessage {
  role: string;
  content: string;
  guardrailFlag: string | null;
  createdAt: string;
}

export type MindLevel = 'iniciante' | 'aprendiz' | 'experiente' | 'mestre';

export interface MindScore {
  score: number;
  level: MindLevel;
  components: {
    persona: { present: boolean; points: number; max: number };
    knowledge: { chunks: number; documents: number; points: number; max: number };
    training: { corrections: number; points: number; max: number };
    confidence: { answered: number; answers: number; rate: number; points: number; max: number };
  };
  nextStep: string;
}

export async function fetchMindScore(slug: string, token: string | null): Promise<MindScore> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/mind-score`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`mind score load failed: ${res.status}`);
  return (await res.json()) as MindScore;
}

export type MindNodeType = 'creator' | 'document' | 'chunk';

export interface MindGraphNode {
  id: string;
  type: MindNodeType;
  label: string;
  kind?: string | null;
}

export interface MindGraphData {
  nodes: MindGraphNode[];
  links: { source: string; target: string }[];
  stats: { documents: number; chunks: number; shownChunks: number };
  truncated: boolean;
}

export async function fetchMindGraph(slug: string, token: string | null): Promise<MindGraphData> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/graph`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`mind graph load failed: ${res.status}`);
  return (await res.json()) as MindGraphData;
}

export async function fetchConversations(
  slug: string,
  token: string | null,
): Promise<ConversationSummary[]> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/conversations`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`conversations load failed: ${res.status}`);
  return ((await res.json()) as { conversations: ConversationSummary[] }).conversations;
}

export async function fetchConversationMessages(
  slug: string,
  id: string,
  token: string | null,
): Promise<ConversationMessage[]> {
  const res = await fetch(
    `/api/creators/${encodeURIComponent(slug)}/conversations/${encodeURIComponent(id)}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(`conversation load failed: ${res.status}`);
  return ((await res.json()) as { messages: ConversationMessage[] }).messages;
}

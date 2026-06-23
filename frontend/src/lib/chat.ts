/**
 * Chat types + pure view helpers (E6.2).
 *
 * The transport (fetch) lives in `postChat`; everything else here is pure so it
 * can be unit-tested without a DOM or a network. Shapes mirror the backend
 * `POST /api/chat` response (`backend/src/services/chat.ts`).
 */

export interface ChatSource {
  chunkId: string;
  documentId: string;
  ordinal: number;
  title: string | null;
  url: string | null;
  score: number;
  rank: number;
}

export interface ChatApiResponse {
  conversationId: string;
  messageId: string;
  content: string;
  fontes: ChatSource[];
  fallback: 'no_context' | null;
  guardrailFlag: string | null;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  /** Stable key for React. Pending assistant turns get a temp id. */
  id: string;
  role: ChatRole;
  content: string;
  /** Deduped sources to render as chips (assistant only). */
  sources: DisplaySource[];
  /** Show the (non-error) investment guardrail notice above the bubble. */
  guardrail: boolean;
  /** Assistant turn still streaming/awaiting the reply → render the dots. */
  pending: boolean;
}

export interface DisplaySource {
  documentId: string;
  /** Chip label, e.g. "de: Título do conteúdo". */
  label: string;
  /** Permalink to the original content, when known — renders as a link. */
  url: string | null;
}

/** Chip label for a retrieved source. */
export function sourceLabel(source: ChatSource): string {
  const title = source.title?.trim();
  return `de: ${title && title.length > 0 ? title : 'conteúdo sem título'}`;
}

/**
 * Collapse multiple retrieved chunks that came from the same document into one
 * chip (the visitor cares about the source content, not each chunk). Order is
 * preserved by first appearance (which is rerank order).
 */
export function dedupeSources(fontes: ChatSource[]): DisplaySource[] {
  const seen = new Set<string>();
  const out: DisplaySource[] = [];
  for (const f of fontes) {
    if (seen.has(f.documentId)) continue;
    seen.add(f.documentId);
    out.push({ documentId: f.documentId, label: sourceLabel(f), url: f.url });
  }
  return out;
}

/** Build the assistant `ChatMessage` to append once a reply arrives. */
export function assistantMessageFromResponse(res: ChatApiResponse): ChatMessage {
  return {
    id: res.messageId,
    role: 'assistant',
    content: res.content,
    // The no_context refusal stands behind no source.
    sources: res.fallback === 'no_context' ? [] : dedupeSources(res.fontes),
    guardrail: res.guardrailFlag === 'investment',
    pending: false,
  };
}

/**
 * Whether a keydown in the composer should submit (Enter without Shift) vs
 * insert a newline (Shift+Enter). Kept pure so it's testable without an event.
 */
export function shouldSubmitOnKey(key: string, shiftKey: boolean, isComposing: boolean): boolean {
  return key === 'Enter' && !shiftKey && !isComposing;
}

function authHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

/** POST a turn to the same-origin Next.js proxy (which forwards to the backend). */
export async function postChat(
  body: { creatorSlug: string; query: string; conversationId?: string },
  accessToken: string | null,
): Promise<ChatApiResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`chat request failed: ${res.status}`);
  }
  return (await res.json()) as ChatApiResponse;
}

export type AccessVerdict = 'allowed' | 'payment_required' | 'unauthorized' | 'unknown';

/** Pre-flight the paywall via `GET /api/c/:slug/access`. */
export async function fetchAccess(
  slug: string,
  accessToken: string | null,
): Promise<AccessVerdict> {
  const res = await fetch(`/api/c/${encodeURIComponent(slug)}/access`, {
    headers: authHeaders(accessToken),
  });
  if (res.status === 200) return 'allowed';
  if (res.status === 402) return 'payment_required';
  if (res.status === 401) return 'unauthorized';
  return 'unknown';
}

/** Open a checkout session and return the hosted URL to redirect to. */
export async function startCheckout(slug: string, accessToken: string | null): Promise<string> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ creatorSlug: slug }),
  });
  if (!res.ok) {
    throw new Error(`checkout failed: ${res.status}`);
  }
  return ((await res.json()) as { url: string }).url;
}

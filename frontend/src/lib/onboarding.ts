/**
 * Onboarding helpers (F1.x self-signup). The handle parser is pure + tested;
 * the create/import calls hit the same-origin proxies with the user's token.
 */

export interface CreatedClone {
  id: string;
  slug: string;
  displayName: string;
}

export interface ImportResult {
  handle: string;
  status: string;
  docs: { total: number; inserted: number; duplicate: number };
  chunks: { created: number };
}

/**
 * Normalize whatever the creator pastes into a bare Instagram handle:
 * a full URL, an `@handle`, or just the handle. Returns null if nothing usable.
 */
export function parseInstagramHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  // Pull the first path segment out of an instagram URL.
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch?.[1]) candidate = urlMatch[1];

  const handle = candidate.replace(/^@/, '').replace(/\/+$/, '').trim();
  // Instagram handles: letters, numbers, dots, underscores.
  if (!/^[A-Za-z0-9._]{1,60}$/.test(handle)) return null;
  return handle;
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function createClone(
  displayName: string,
  niche: string | undefined,
  token: string | null,
): Promise<CreatedClone> {
  const res = await fetch('/api/creators', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ displayName, niche }),
  });
  if (!res.ok) throw new Error(`create clone failed: ${res.status}`);
  return (await res.json()) as CreatedClone;
}

export async function importInstagram(
  slug: string,
  handle: string,
  token: string | null,
): Promise<ImportResult> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/sources/instagram`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ handle }),
  });
  if (!res.ok) throw new Error(`instagram import failed: ${res.status}`);
  return (await res.json()) as ImportResult;
}

/**
 * Train the clone's voice: auto-generate the Persona Card from imported
 * content. Best-effort — onboarding swallows failures (the creator can always
 * generate/edit later in the Studio).
 */
export async function generatePersona(slug: string, token: string | null): Promise<boolean> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/persona/generate`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return res.ok;
}

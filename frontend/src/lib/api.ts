import type { PublicCreator } from './creator';

/**
 * Base URL of the Hono backend. Server Components run in Node, so this is read
 * from the environment at request time; defaults to the local dev backend.
 */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

/**
 * Fetch a creator's public landing profile. Returns null on 404 (unknown slug)
 * so the page can render `notFound()`. Throws on any other non-OK status so a
 * backend outage surfaces as an error rather than a silent empty page.
 */
/**
 * Forward a same-origin proxy request to the Hono backend (E6.3), carrying the
 * caller's `Authorization` header so the backend can authenticate. Keeps the
 * backend URL server-side and avoids CORS. Used by the route handlers under
 * `app/api/*`.
 */
export async function forwardToBackend(req: Request, backendPath: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const auth = req.headers.get('authorization');
  if (auth) headers.authorization = auth;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(`${apiBaseUrl()}${backendPath}`, init);
  const payload = await upstream.text();
  return new Response(payload, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function fetchCreator(slug: string): Promise<PublicCreator | null> {
  const res = await fetch(`${apiBaseUrl()}/api/creators/${encodeURIComponent(slug)}`, {
    // Landing data changes rarely but should reflect Studio edits quickly.
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`fetchCreator(${slug}) failed: ${res.status}`);
  }
  return (await res.json()) as PublicCreator;
}

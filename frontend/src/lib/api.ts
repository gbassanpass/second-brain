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

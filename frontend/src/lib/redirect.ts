/**
 * Post-auth redirect handling. A shared chat link (e.g.
 * `/c/fausto-bassan/chat?code=XYZ`) sends logged-out visitors through
 * login/signup; we carry the original path in a `redirect` query param and
 * return to it after auth — so the audience lands back on the chat, not on the
 * creator onboarding.
 */

/** Where creators go after signup when there's no specific return path. */
export const DEFAULT_AFTER_AUTH = '/onboarding';

/**
 * Only allow same-origin relative paths (must start with a single `/`). This
 * blocks open-redirects to `//evil.com` or `https://evil.com`.
 */
export function safeRelativePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

/** Read + sanitize the `redirect` param from the current URL (client only). */
export function redirectParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return safeRelativePath(new URLSearchParams(window.location.search).get('redirect'));
}

/** Build `/login?redirect=<here>` (or any base) pointing back to `target`. */
export function withRedirect(base: string, target: string): string {
  return `${base}?redirect=${encodeURIComponent(target)}`;
}

/** Current path + query, for use as a redirect target (client only). */
export function currentPathWithQuery(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

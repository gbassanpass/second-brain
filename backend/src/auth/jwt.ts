import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Subset of a Supabase access-token payload we actually consume. GoTrue puts
 * its public-API role (anon/authenticated/service_role) in the top-level
 * `role` field, but our domain role (`subscriber`/`creator`/`operator`) lives
 * in `public.users.role` — looked up by `external_id == sub` in the middleware.
 *
 * See https://supabase.com/docs/guides/auth/jwts and GoTrue source for the
 * exact shape — the keys here are the only ones we read.
 */
export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  /** Unix-seconds expiration. Verifier rejects when current time > exp. */
  exp: number;
  iat?: number;
  /** GoTrue's public role — NOT our domain role. */
  role?: string;
  aud?: string | string[];
}

export class JwtError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'malformed'
      | 'unsupported_alg'
      | 'bad_signature'
      | 'expired'
      | 'missing_claim',
  ) {
    super(message);
    this.name = 'JwtError';
  }
}

/**
 * Verifies a Supabase HS256 JWT against `secret`. No external dep — `node:crypto`
 * does the HMAC + a constant-time compare on the signature. Returns the parsed
 * payload on success; throws `JwtError` on any failure mode.
 *
 * The verifier is intentionally narrow:
 *   - only HS256 (the algorithm GoTrue uses with its shared secret),
 *   - mandatory `sub` and numeric `exp`,
 *   - `now()` clock from the caller (defaults to Date.now()) so tests can pin
 *     time without mocking globals.
 */
export function verifySupabaseJWT(
  token: string,
  secret: string,
  now: () => number = Date.now,
): SupabaseJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('JWT must have three dot-separated parts', 'malformed');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeJsonPart(headerB64, 'header');
  if (header.alg !== 'HS256') {
    throw new JwtError(`unsupported alg=${String(header.alg)} (only HS256)`, 'unsupported_alg');
  }
  if (header.typ && header.typ !== 'JWT') {
    throw new JwtError(`unsupported typ=${String(header.typ)}`, 'unsupported_alg');
  }

  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  const got = base64UrlDecode(signatureB64);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw new JwtError('signature mismatch', 'bad_signature');
  }

  const payload = decodeJsonPart(payloadB64, 'payload') as Partial<SupabaseJwtPayload>;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new JwtError('missing sub claim', 'missing_claim');
  }
  if (typeof payload.exp !== 'number') {
    throw new JwtError('missing or non-numeric exp claim', 'missing_claim');
  }
  const nowSec = Math.floor(now() / 1000);
  if (nowSec >= payload.exp) {
    throw new JwtError(`token expired (exp=${payload.exp}, now=${nowSec})`, 'expired');
  }

  return payload as SupabaseJwtPayload;
}

/**
 * Sign-only helper for tests: builds a valid HS256 JWT with the given payload.
 * Not exported via a separate module to keep the surface tiny — tests reach
 * for `signJwtForTesting` and prod code never imports it.
 */
export function signJwtForTesting(
  payload: Partial<SupabaseJwtPayload> & { sub: string },
  secret: string,
  ttlSeconds = 3600,
): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const nowSec = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    Buffer.from(JSON.stringify({ iat: nowSec, exp: nowSec + ttlSeconds, ...payload })),
  );
  const sig = base64UrlEncode(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function decodeJsonPart(part: string, label: 'header' | 'payload'): Record<string, unknown> {
  try {
    return JSON.parse(base64UrlDecode(part).toString('utf8'));
  } catch (err) {
    throw new JwtError(
      `${label} is not valid base64url JSON: ${(err as Error).message}`,
      'malformed',
    );
  }
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

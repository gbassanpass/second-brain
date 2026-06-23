import { createHmac, createPublicKey, verify as cryptoVerify, timingSafeEqual } from 'node:crypto';

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
      | 'missing_claim'
      | 'unknown_key',
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
 * Kept for the legacy shared-secret path and for tests (`signJwtForTesting`).
 * Real Supabase tokens are now asymmetric (ES256) — use `verifySupabaseToken`,
 * which routes HS256 here and ES256/RS256 through JWKS.
 */
export function verifySupabaseJWT(
  token: string,
  secret: string,
  now: () => number = Date.now,
): SupabaseJwtPayload {
  const { headerB64, payloadB64, signatureB64 } = splitToken(token);
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
  return parsePayloadWithClaims(payloadB64, now);
}

export interface VerifyTokenOptions {
  /** HS256 shared secret (legacy + tests). */
  secret?: string;
  /** JWKS endpoint for asymmetric verification, e.g. `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. */
  jwksUrl?: string;
  now?: () => number;
  /** Injectable fetch for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Verifies a Supabase access token regardless of signing scheme:
 *   - `HS256` → shared-secret HMAC (legacy projects + our test tokens),
 *   - `ES256` / `RS256` → asymmetric, public key fetched from the project's
 *     JWKS endpoint by `kid` (the default for current Supabase / GoTrue).
 *
 * Async because the asymmetric path may fetch (and cache) the JWKS.
 */
export async function verifySupabaseToken(
  token: string,
  opts: VerifyTokenOptions,
): Promise<SupabaseJwtPayload> {
  const now = opts.now ?? Date.now;
  const { headerB64, payloadB64, signatureB64 } = splitToken(token);
  const header = decodeJsonPart(headerB64, 'header');
  const alg = String(header.alg);

  if (alg === 'HS256') {
    if (!opts.secret) throw new JwtError('no HS256 secret configured', 'unsupported_alg');
    return verifySupabaseJWT(token, opts.secret, now);
  }
  if (alg === 'ES256' || alg === 'RS256') {
    if (!opts.jwksUrl) throw new JwtError(`alg=${alg} requires a JWKS url`, 'unsupported_alg');
    const jwk = await getJwk(String(header.kid), opts.jwksUrl, opts.fetchImpl ?? fetch);
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const sig = base64UrlDecode(signatureB64);
    // ES256 signatures are raw r||s (IEEE-P1363); RS256 is plain RSA-PKCS1.
    const ok = cryptoVerify(
      'sha256',
      data,
      alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
      sig,
    );
    if (!ok) throw new JwtError('signature mismatch', 'bad_signature');
    return parsePayloadWithClaims(payloadB64, now);
  }
  throw new JwtError(`unsupported alg=${alg}`, 'unsupported_alg');
}

// --- JWKS cache -----------------------------------------------------------
// Maps `kid` → JWK. Populated lazily; on a cache miss we refetch the whole set
// (handles key rotation). Module-level so it's shared across requests.
type Jwk = Record<string, unknown> & { kid?: string };
const jwksCache = new Map<string, Jwk>();

async function getJwk(kid: string, jwksUrl: string, fetchImpl: typeof fetch): Promise<Jwk> {
  const cached = jwksCache.get(kid);
  if (cached) return cached;

  const res = await fetchImpl(jwksUrl);
  if (!res.ok) throw new JwtError(`JWKS fetch failed: ${res.status}`, 'unknown_key');
  const body = (await res.json()) as { keys?: Jwk[] };
  for (const k of body.keys ?? []) {
    if (typeof k.kid === 'string') jwksCache.set(k.kid, k);
  }
  const found = jwksCache.get(kid);
  if (!found) throw new JwtError(`no JWKS key for kid=${kid}`, 'unknown_key');
  return found;
}

/** Test seam: drop the JWKS cache (so a rotated key set is re-read). */
export function clearJwksCacheForTests(): void {
  jwksCache.clear();
}

/**
 * Sign-only helper for tests: builds a valid HS256 JWT with the given payload.
 * Prod code never imports it.
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

function splitToken(token: string): {
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('JWT must have three dot-separated parts', 'malformed');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  return { headerB64, payloadB64, signatureB64 };
}

function parsePayloadWithClaims(payloadB64: string, now: () => number): SupabaseJwtPayload {
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

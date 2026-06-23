import { sign as cryptoSign, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  JwtError,
  clearJwksCacheForTests,
  signJwtForTesting,
  verifySupabaseJWT,
  verifySupabaseToken,
} from '../src/auth/jwt.js';

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const OTHER_SECRET = 'different-secret-32-characters-minimum-padding-x';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signEs256(payload: Record<string, unknown>, privateKey: KeyObject, kid: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = cryptoSign('sha256', Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${body}.${b64url(sig)}`;
}

describe('verifySupabaseJWT', () => {
  it('round-trips a freshly signed token', () => {
    const token = signJwtForTesting({ sub: 'user-1', email: 'a@b.com' }, SECRET);
    const payload = verifySupabaseJWT(token, SECRET);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects a token signed with a different secret (bad_signature)', () => {
    const token = signJwtForTesting({ sub: 'user-1' }, OTHER_SECRET);
    expect(() => verifySupabaseJWT(token, SECRET)).toThrow(JwtError);
    try {
      verifySupabaseJWT(token, SECRET);
    } catch (err) {
      expect((err as JwtError).code).toBe('bad_signature');
    }
  });

  it('rejects an expired token (expired)', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = signJwtForTesting({ sub: 'user-1', exp: past }, SECRET, 1);
    try {
      verifySupabaseJWT(token, SECRET);
    } catch (err) {
      expect((err as JwtError).code).toBe('expired');
      return;
    }
    throw new Error('expected expired JWT to throw');
  });

  it('accepts a token whose own exp is in the future even if `now` is given', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = signJwtForTesting({ sub: 'user-1', exp: future }, SECRET);
    const payload = verifySupabaseJWT(token, SECRET, () => Date.now());
    expect(payload.sub).toBe('user-1');
  });

  it("rejects garbage that isn't even three parts (malformed)", () => {
    try {
      verifySupabaseJWT('not.a.jwt.token', SECRET);
    } catch (err) {
      expect((err as JwtError).code).toBe('malformed');
      return;
    }
    throw new Error('expected malformed JWT to throw');
  });

  it('rejects unsupported algorithms (unsupported_alg)', () => {
    // Hand-craft a header advertising alg=none.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 9_999_999_999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    try {
      verifySupabaseJWT(`${header}.${body}.`, SECRET);
    } catch (err) {
      expect((err as JwtError).code).toBe('unsupported_alg');
      return;
    }
    throw new Error('expected alg=none to be rejected');
  });

  it('rejects a payload missing sub (missing_claim)', () => {
    // Manually craft a payload with no sub but otherwise valid.
    const token = signJwtForTesting({ sub: '' }, SECRET);
    try {
      verifySupabaseJWT(token, SECRET);
    } catch (err) {
      expect((err as JwtError).code).toBe('missing_claim');
      return;
    }
    throw new Error('expected missing sub to throw');
  });
});

describe('verifySupabaseToken (HS256 + ES256/JWKS)', () => {
  afterEach(() => clearJwksCacheForTests());

  const KID = 'kid-test-1';
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig' };
  const jwksUrl = 'http://auth.local/auth/v1/.well-known/jwks.json';
  const jwksFetch = (async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

  const future = () => Math.floor(Date.now() / 1000) + 3600;

  it('still verifies HS256 via the shared secret', async () => {
    const token = signJwtForTesting({ sub: 'hs-user' }, SECRET);
    const payload = await verifySupabaseToken(token, { secret: SECRET });
    expect(payload.sub).toBe('hs-user');
  });

  it('verifies a real-shaped ES256 token against the JWKS', async () => {
    const token = signEs256({ sub: 'es-user', exp: future() }, privateKey, KID);
    const payload = await verifySupabaseToken(token, { jwksUrl, fetchImpl: jwksFetch });
    expect(payload.sub).toBe('es-user');
  });

  it('rejects an ES256 token tampered after signing (bad_signature)', async () => {
    const token = signEs256({ sub: 'es-user', exp: future() }, privateKey, KID);
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url(Buffer.from(JSON.stringify({ sub: 'attacker', exp: future() })))}.${s}`;
    await expect(verifySupabaseToken(forged, { jwksUrl, fetchImpl: jwksFetch })).rejects.toThrow(
      JwtError,
    );
  });

  it('rejects an ES256 token whose kid is not in the JWKS (unknown_key)', async () => {
    const token = signEs256({ sub: 'es-user', exp: future() }, privateKey, 'kid-unknown');
    await expect(
      verifySupabaseToken(token, { jwksUrl, fetchImpl: jwksFetch }),
    ).rejects.toMatchObject({ code: 'unknown_key' });
  });

  it('rejects ES256 when no JWKS url is configured (unsupported_alg)', async () => {
    const token = signEs256({ sub: 'es-user', exp: future() }, privateKey, KID);
    await expect(verifySupabaseToken(token, { secret: SECRET })).rejects.toMatchObject({
      code: 'unsupported_alg',
    });
  });
});

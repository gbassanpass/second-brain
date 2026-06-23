import { describe, expect, it } from 'vitest';
import { JwtError, signJwtForTesting, verifySupabaseJWT } from '../src/auth/jwt.js';

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const OTHER_SECRET = 'different-secret-32-characters-minimum-padding-x';

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

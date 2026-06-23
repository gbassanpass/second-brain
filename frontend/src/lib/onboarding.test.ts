import { describe, expect, it } from 'vitest';
import { parseInstagramHandle } from './onboarding';

describe('parseInstagramHandle', () => {
  it('extracts the handle from a full URL', () => {
    expect(parseInstagramHandle('https://www.instagram.com/faustobassan')).toBe('faustobassan');
    expect(parseInstagramHandle('https://instagram.com/faustobassan/')).toBe('faustobassan');
    expect(parseInstagramHandle('http://www.instagram.com/fausto.bassan?hl=pt')).toBe(
      'fausto.bassan',
    );
  });

  it('accepts @handle and bare handle', () => {
    expect(parseInstagramHandle('@faustobassan')).toBe('faustobassan');
    expect(parseInstagramHandle('  faustobassan  ')).toBe('faustobassan');
    expect(parseInstagramHandle('fausto_bassan')).toBe('fausto_bassan');
  });

  it('returns null for empty or invalid input', () => {
    expect(parseInstagramHandle('')).toBeNull();
    expect(parseInstagramHandle('   ')).toBeNull();
    expect(parseInstagramHandle('has spaces')).toBeNull();
    expect(parseInstagramHandle('nome!inválido')).toBeNull();
  });
});

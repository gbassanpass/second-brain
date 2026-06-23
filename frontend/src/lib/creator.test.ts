import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCLAIMER,
  EXAMPLE_QUESTIONS,
  type PublicCreator,
  buildLandingView,
  initialsFor,
} from './creator';

const base: PublicCreator = {
  slug: 'fausto',
  displayName: 'Fausto Bassan',
  niche: 'geopolítica',
  oneLiner: 'Explico o mundo sem torcer.',
  disclaimer: 'Conteúdo educativo; não é recomendação de investimento.',
};

describe('initialsFor', () => {
  it('takes first + last initials', () => {
    expect(initialsFor('Fausto Bassan')).toBe('FB');
  });
  it('handles a single word', () => {
    expect(initialsFor('Fausto')).toBe('F');
  });
  it('ignores extra whitespace', () => {
    expect(initialsFor('  Ana  Maria  Souza ')).toBe('AS');
  });
  it('falls back to ? on empty', () => {
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('buildLandingView', () => {
  it('maps the full profile', () => {
    const v = buildLandingView(base);
    expect(v.slug).toBe('fausto');
    expect(v.initials).toBe('FB');
    expect(v.mindLabel).toBe('Fausto Bassan · mente digital');
    expect(v.tagline).toBe('Explico o mundo sem torcer.');
    expect(v.chatHref).toBe('/c/fausto/chat');
    expect(v.disclaimer).toContain('não é recomendação');
    expect(v.exampleQuestions).toEqual(EXAMPLE_QUESTIONS);
  });

  it('falls back to a niche-derived tagline when no one-liner', () => {
    const v = buildLandingView({ ...base, oneLiner: null });
    expect(v.tagline).toBe('Mente digital sobre geopolítica.');
  });

  it('falls back to a neutral tagline with neither one-liner nor niche', () => {
    const v = buildLandingView({ ...base, oneLiner: null, niche: null });
    expect(v.tagline).toBe('Converse com a mente digital.');
  });

  it('uses the default disclaimer when the creator has none', () => {
    const v = buildLandingView({ ...base, disclaimer: null });
    expect(v.disclaimer).toBe(DEFAULT_DISCLAIMER);
    // Non-deception notice must be present.
    expect(v.disclaimer).toContain('mente digital');
  });

  it('treats a blank one-liner as missing', () => {
    const v = buildLandingView({ ...base, oneLiner: '   ' });
    expect(v.tagline).toBe('Mente digital sobre geopolítica.');
  });
});

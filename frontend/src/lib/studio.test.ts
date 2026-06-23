import { describe, expect, it } from 'vitest';
import {
  type PersonaCard,
  type PersonaForm,
  canUseStudio,
  formToPersona,
  formatLatency,
  formatPercent,
  formatUsd,
  personaFormError,
  personaToForm,
} from './studio';

const card: PersonaCard = {
  name: 'Fausto Bassan',
  one_liner: 'Explico o mundo sem torcer.',
  voice: ['didático', 'direto'],
  frameworks: ['quem ganha o quê'],
  do: ['explicar sem viés'],
  dont: ['recomendar ativos'],
  catchphrases: ['sem torcer'],
  disclaimer: 'Conteúdo educativo.',
};

describe('canUseStudio', () => {
  it('allows creator/operator, blocks others', () => {
    expect(canUseStudio('creator')).toBe(true);
    expect(canUseStudio('operator')).toBe(true);
    expect(canUseStudio('subscriber')).toBe(false);
    expect(canUseStudio(undefined)).toBe(false);
  });
});

describe('personaToForm / formToPersona round-trip', () => {
  it('flattens arrays to lines and back', () => {
    const form = personaToForm(card);
    expect(form.voice).toBe('didático\ndireto');
    expect(form.disclaimer).toBe('Conteúdo educativo.');
    expect(formToPersona(form)).toEqual(card);
  });

  it('omits a blank disclaimer', () => {
    const form = personaToForm({ ...card, disclaimer: undefined });
    expect(form.disclaimer).toBe('');
    expect(formToPersona(form).disclaimer).toBeUndefined();
  });

  it('trims and drops empty lines in array fields', () => {
    const form: PersonaForm = {
      name: '  Fausto ',
      one_liner: ' x ',
      voice: 'didático\n\n  direto  \n',
      frameworks: '',
      do: '',
      dont: '',
      catchphrases: '',
      disclaimer: '   ',
    };
    const out = formToPersona(form);
    expect(out.name).toBe('Fausto');
    expect(out.voice).toEqual(['didático', 'direto']);
    expect(out.frameworks).toEqual([]);
    expect(out.disclaimer).toBeUndefined();
  });
});

describe('personaFormError', () => {
  const base = personaToForm(card);
  it('passes a complete form', () => {
    expect(personaFormError(base)).toBeNull();
  });
  it('requires name, one_liner, and at least one voice trait', () => {
    expect(personaFormError({ ...base, name: '  ' })).toMatch(/nome/i);
    expect(personaFormError({ ...base, one_liner: '' })).toMatch(/uma linha/i);
    expect(personaFormError({ ...base, voice: '\n' })).toMatch(/voz/i);
  });
});

describe('analytics formatters', () => {
  it('formatUsd shows more precision for sub-cent values', () => {
    expect(formatUsd(0.0008)).toBe('US$ 0.0008');
    expect(formatUsd(12.5)).toBe('US$ 12.50');
  });
  it('formatPercent rounds to whole percent', () => {
    expect(formatPercent(1 / 3)).toBe('33%');
    expect(formatPercent(0)).toBe('0%');
  });
  it('formatLatency switches unit and handles null', () => {
    expect(formatLatency(850)).toBe('850ms');
    expect(formatLatency(2000)).toBe('2.0s');
    expect(formatLatency(null)).toBe('—');
  });
});

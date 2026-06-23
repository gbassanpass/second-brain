import { describe, expect, it } from 'vitest';

describe('frontend smoke', () => {
  it('runs vitest in the frontend workspace', () => {
    expect(1 + 1).toBe(2);
  });
});

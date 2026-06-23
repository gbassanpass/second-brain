import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'backend',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});

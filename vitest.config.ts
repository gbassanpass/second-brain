import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['backend', 'frontend'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['backend/src/**', 'frontend/src/**'],
    },
  },
});

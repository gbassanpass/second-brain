import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'frontend',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});

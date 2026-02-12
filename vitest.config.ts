import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    include: ['src/__tests__/**/*.test.ts'],
  },
});

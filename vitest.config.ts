import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/api/test/**/*.test.ts',
      'apps/miniprogram/src/lib/**/*.test.ts',
    ],
    testTimeout: 15000,
  },
});

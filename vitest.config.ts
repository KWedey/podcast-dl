import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    // Integration tests spawn the CLI several times per test; cold CI runners need headroom.
    testTimeout: 30_000,
  },
});

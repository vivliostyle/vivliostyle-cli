import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
    coverage: {
      provider: 'v8',
      exclude: ['node_modules/', 'tests/', 'tmp/', 'vendors/'],
    },
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    globalSetup: ['tests/globalSetup/clean.ts'],
  },
});

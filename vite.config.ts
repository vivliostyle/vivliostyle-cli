import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
    coverage: {
      provider: 'v8',
      include: ['schemas/**', 'src/**'],
    },
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    globalSetup: ['tests/global-setup/clean.ts'],
    env: {
      NO_COLOR: 'true',
    },
    clearMocks: true,
    pool:
      process.platform === 'linux'
        ? // In Linux, we need to use forks mode to avoid segfaults
          // https://vitest.dev/guide/common-errors.html#segfaults-and-native-code-errors
          'forks'
        : 'threads',
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
    server: {
      deps: {
        // Load this fixture with the native Node.js resolver rather than
        // Vite's module runner to test the module resolution fallback
        external: [/fixtures\/config-import-fallback/v],
      },
    },
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
  },
});

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  fixedExtension: false,
  sourcemap: false,
  deps: {
    onlyBundle: false,
  },
});

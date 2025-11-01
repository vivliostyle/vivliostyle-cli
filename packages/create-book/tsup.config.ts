import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  clean: true,
  sourcemap: true,
  banner: {
    // https://github.com/evanw/esbuild/issues/1921
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});

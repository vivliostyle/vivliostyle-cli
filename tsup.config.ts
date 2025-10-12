import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/node-modules.ts',
    'src/vite-adapter.ts',
    'src/config/schema.ts',
    'src/commands/build.ts',
    'src/commands/create.ts',
    'src/commands/init.ts',
    'src/commands/preview.ts',
  ],
  format: 'esm',
  dts: true,
  clean: true,
  sourcemap: true,
});

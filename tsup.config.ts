import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/vite-adapter.ts',
    'src/config/schema.ts',
    'src/commands/build.ts',
    'src/commands/init.ts',
    'src/commands/preview.ts',
  ],
  format: 'esm',
  dts: true,
  clean: true,
});

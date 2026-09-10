import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/constants.ts',
    'src/node-modules.ts',
    'src/vite-adapter.ts',
    'src/config/schema.ts',
    'src/commands/build.ts',
    'src/commands/create.ts',
    'src/commands/init.ts',
    'src/commands/preview.ts',
    'src/commands/theme.ts',
    'src/commands/theme-create.ts',
    'src/commands/theme-validate.ts',
  ],
  target: 'node22.12',
  fixedExtension: false,
  deps: {
    onlyBundle: [/^@types\/.*/v],
  },
});

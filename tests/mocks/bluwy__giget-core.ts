import type { NestedDirectoryJSON } from 'memfs';

import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { vol } = await import('memfs');
  const { mockRequire } = await import('./index.js');

  const mod = {
    downloadTemplate(
      input: string,
      { dir, cwd }: { dir?: string; cwd?: string } = {},
    ) {
      const repo = 'vivliostyle/vivliostyle-cli/';
      const loc = input
        .replace(/^.+:/, '')
        .replace(/#.+$/, '')
        .split('/')
        .filter(Boolean)
        .join('/');
      const source = path.resolve(
        fileURLToPath(import.meta.url),
        ...(loc.startsWith(repo)
          ? ['../../..', loc.slice(repo.length)]
          : ['../../fixtures/themes', loc]),
      );
      const dest = path.join(cwd || '', dir || '');
      const walk = (dir: string) => {
        const files: NestedDirectoryJSON = {};
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const entryPath = path.join(dir, entry.name);
          files[entry.name] = entry.isDirectory()
            ? walk(entryPath)
            : fs.readFileSync(entryPath, 'utf8');
        }
        return files;
      };
      const files = walk(source);
      vol.fromNestedJSON(files, dest);
    },
  };

  await mockRequire('@bluwy/giget-core', mod);
  return { '@bluwy/giget-core': mod };
});

vi.mock('@bluwy/giget-core', () => mocked['@bluwy/giget-core']);

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
      const copyFiles = (srcDir: string, destDir: string) => {
        vol.mkdirSync(destDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, {
          withFileTypes: true,
        })) {
          const srcPath = path.join(srcDir, entry.name);
          const dstPath = path.join(destDir, entry.name);
          if (entry.isDirectory()) {
            copyFiles(srcPath, dstPath);
          } else {
            vol.writeFileSync(dstPath, fs.readFileSync(srcPath));
          }
        }
      };
      copyFiles(source, dest);
    },
  };

  await mockRequire('@bluwy/giget-core', mod);
  return { '@bluwy/giget-core': mod };
});

vi.mock('@bluwy/giget-core', () => mocked['@bluwy/giget-core']);

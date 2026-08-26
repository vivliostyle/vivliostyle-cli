import { fileURLToPath } from 'node:url';

import { vol } from 'memfs';
import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { fs: memfs } = await import('memfs');
  const { mockRequire } = await import('./index.js');

  const fs = { ...memfs, default: memfs };

  await mockRequire('fs', fs);
  return { fs };
});

vi.mock('fs', () => mocked.fs);
vi.mock('node:fs', () => mocked.fs);
vi.mock('fs/promises', () => mocked.fs.promises);
vi.mock('node:fs/promises', () => mocked.fs.promises);

// The CLI locates its own dependencies (e.g. @vivliostyle/viewer) with the
// fs-based findPackageDir at import time; the packages must exist on the
// in-memory filesystem before the source modules load
vol.fromJSON({
  [fileURLToPath(
    new URL(
      '../../node_modules/@vivliostyle/viewer/package.json',
      import.meta.url,
    ),
  ).replaceAll('\\', '/')]: '{}',
});

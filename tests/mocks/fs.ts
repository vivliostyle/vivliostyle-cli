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

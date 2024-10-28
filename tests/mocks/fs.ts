import { vi } from 'vitest';

const mockedFs = await vi.hoisted(async () => {
  const { fs: memfs } = await import('memfs');
  const { mock } = await import('./index.js');

  const stub = { ...memfs, default: memfs };
  await mock('fs', stub);
  return stub;
});

vi.mock('fs', () => mockedFs);
vi.mock('node:fs', () => mockedFs);
vi.mock('fs/promises', () => mockedFs.promises);
vi.mock('node:fs/promises', () => mockedFs.promises);

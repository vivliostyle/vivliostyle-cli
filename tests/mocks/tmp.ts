import { fs as memfs } from 'memfs';
import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { mockRequire } = await import('./index.js');

  const tmpDefault = {
    dir: (_: unknown, cb: (err: Error | null, path?: string) => void) => {
      if (!memfs.existsSync('/tmp')) {
        memfs.mkdirSync('/tmp', { recursive: true });
      }
      const len = memfs.readdirSync('/tmp').length;
      const target = `/tmp/${len + 1}`;
      memfs.mkdirSync(target, { recursive: true });
      cb(null, target);
    },
  };

  await mockRequire('tmp', { default: tmpDefault });
  return { tmp: { default: tmpDefault } };
});

vi.mock('tmp', () => mocked.tmp);

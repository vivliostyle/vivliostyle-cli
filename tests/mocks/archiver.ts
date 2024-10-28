import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { vol } = await import('memfs');
  const { upath } = await import('../../vendors/index.js');
  const { mockRequire } = await import('./index.js');

  const { default: archiver } = await vi.importActual<{
    default: typeof import('archiver');
  }>('archiver');

  const archiverDefault = (...args: Parameters<typeof archiver>) => {
    const archive = archiver(...args);
    archive.directory = (dirpath, destpath) => {
      for (const p in vol.toJSON(dirpath, undefined, true)) {
        archive.append(vol.readFileSync(upath.join(dirpath, p)), {
          name: upath.join(destpath, p),
        });
      }
      return archive;
    };
    return archive;
  };
  await mockRequire('archiver', { default: archiverDefault });
  return { archiver: { default: archiverDefault } };
});

vi.mock('archiver', () => mocked.archiver);

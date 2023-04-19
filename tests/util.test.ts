import { safeGlob } from '../src/util';
import { resolveFixture } from './commandUtil.js';

it('safeGlob follows symbolic link: ../..', async () => {
  const result1 = await safeGlob('**', {
    cwd: resolveFixture('glob/a'),
    followSymbolicLinks: false,
  });
  expect(new Set(result1)).toEqual(new Set(['A', 'b/B', 'b/c/C']));

  const result2 = await safeGlob('**', {
    cwd: resolveFixture('glob/a'),
    followSymbolicLinks: true,
  });
  expect(new Set(result2)).toEqual(
    new Set(['A', 'b/B', 'b/c/C', 'b/c/d/A', 'b/c/d/b/B', 'b/c/d/b/c/C']),
  );

  const result3 = await safeGlob('**', {
    cwd: resolveFixture('glob/a/b'),
    followSymbolicLinks: true,
    ignoreFiles: ['**/.mygitignore'],
  });
  expect(new Set(result3)).toEqual(new Set(['B', 'c/C', 'c/d/A']));
});

it('safeGlob follows symbolic link: ../../i ../../f', async () => {
  const result1 = await safeGlob('**', {
    cwd: resolveFixture('glob/e'),
    followSymbolicLinks: false,
  });
  expect(new Set(result1)).toEqual(
    new Set(['E', 'f/F', 'f/g/G', 'i/I', 'i/j/J']),
  );

  const result2 = await safeGlob('**', {
    cwd: resolveFixture('glob/e'),
    followSymbolicLinks: true,
  });
  expect(new Set(result2)).toEqual(
    new Set([
      'E',
      'f/F',
      'f/g/G',
      'f/g/h/I',
      'f/g/h/j/J',
      'i/I',
      'i/j/J',
      'i/j/k/F',
      'i/j/k/g/G',
    ]),
  );

  const result3 = await safeGlob('**', {
    cwd: resolveFixture('glob/e'),
    followSymbolicLinks: true,
    ignoreFiles: ['**/.mygitignore'],
  });
  expect(new Set(result3)).toEqual(
    new Set(['E', 'f/F', 'f/g/G', 'f/g/h/j/J', 'i/I', 'i/j/J', 'i/j/k/F']),
  );
});

import './mocks/fs.js';
import './mocks/tmp.js';

import { expect, it, vi } from 'vitest';
import { build, create, preview } from '../src/index.js';

it('provides build function', async () => {
  const mockedBuild = vi.hoisted(() => vi.fn());
  vi.mock('../src/core/build', () => ({ build: mockedBuild }));

  await build({
    config: 'vivliostyle.config.js',
  });
  expect(mockedBuild).toHaveBeenLastCalledWith(
    expect.objectContaining({
      config: 'vivliostyle.config.js',
    }),
  );
});

it('provides create function', async () => {
  const mockedCreate = vi.hoisted(() => vi.fn());
  vi.mock('../src/core/create', () => ({ create: mockedCreate }));

  await create({
    title: 'Vivliostyle',
    author: 'John Doe',
    projectPath: 'my-project',
    createConfigFileOnly: true,
  });
  expect(mockedCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'Vivliostyle',
      author: 'John Doe',
      projectPath: 'my-project',
      createConfigFileOnly: true,
    }),
  );
});

it('provides preview function', async () => {
  const mockedPreview = vi.hoisted(() => vi.fn());
  vi.mock('../src/core/preview', () => ({ preview: mockedPreview }));

  await preview({
    input: 'index.html',
  });
  expect(mockedPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: { entry: 'index.html', format: 'webbook' },
    }),
  );
});

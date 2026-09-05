import './mocks/fs.js';
import './mocks/tmp.js';
import { expect, it, vi } from 'vitest';

const mockedBuild = vi.hoisted(() =>
  vi.fn<typeof import('../src/core/build.js').build>(),
);
const mockedCreate = vi.hoisted(() =>
  vi.fn<typeof import('../src/core/create.js').create>(),
);
const mockedPreview = vi.hoisted(() =>
  vi.fn<typeof import('../src/core/preview.js').preview>(),
);

vi.mock('../src/core/build', () => ({ build: mockedBuild }));
vi.mock('../src/core/create', () => ({ create: mockedCreate }));
vi.mock('../src/core/preview', () => ({ preview: mockedPreview }));

import {
  build,
  create,
  createBuiltinCmykConversionReplacement,
  createBuiltinGrayConversionReplacement,
  createBuiltinRgbConversionReplacement,
  createIccConversionReplacement,
  preview,
} from '../src/index.js';

it('provides build function', async () => {
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
  await preview({
    input: 'index.html',
  });
  expect(mockedPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: { entry: 'index.html', format: 'webbook' },
    }),
  );
});

it('provides image conversion replacement factories', () => {
  expect(createBuiltinGrayConversionReplacement()).toEqual({
    kind: 'builtin',
    destination: 'DeviceGray',
    inputProfile: undefined,
  });
  expect(createBuiltinRgbConversionReplacement()).toEqual({
    kind: 'builtin',
    destination: 'DeviceRGB',
    inputProfile: undefined,
  });
  expect(createBuiltinCmykConversionReplacement()).toEqual({
    kind: 'builtin',
    destination: 'DeviceCMYK',
    inputProfile: undefined,
  });
  expect(
    createIccConversionReplacement({ outputProfile: 'output.icc' }),
  ).toEqual({
    kind: 'icc',
    inputProfile: undefined,
    outputProfile: 'output.icc',
  });
});

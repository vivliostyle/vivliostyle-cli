import { expect, it, vi } from 'vitest';
import { build, init, preview } from '../src/index.js';

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

it('provides init function', async () => {
  const mockedInit = vi.hoisted(() => vi.fn());
  vi.mock('../src/core/init', () => ({ init: mockedInit }));

  await init({
    title: 'Vivliostyle',
  });
  expect(mockedInit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'Vivliostyle',
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

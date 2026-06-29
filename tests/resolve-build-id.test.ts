import './mocks/fs.js';
import { vol } from 'memfs';
import { beforeEach, expect, it, vi } from 'vitest';

import { getExecutableBrowserPath } from '../src/browser.js';
import { Logger } from '../src/logger.js';

const browsersMock = vi.hoisted(() => ({
  resolveBuildId: vi.fn<() => Promise<string>>(),
  computeExecutablePath: vi.fn<(options: { buildId: string }) => string>(
    ({ buildId }) => `/cache/chrome/${buildId}/chrome`,
  ),
}));

vi.mock('@puppeteer/browsers', () => browsersMock);

beforeEach(() => {
  vi.clearAllMocks();
  vol.reset();
});

it('uses the resolved build id when registry resolution succeeds', async () => {
  const logWarn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  browsersMock.resolveBuildId.mockResolvedValueOnce('resolved-build-id');

  const path = await getExecutableBrowserPath({
    type: 'chrome',
    tag: '128',
    executablePath: undefined,
  });

  expect(browsersMock.computeExecutablePath).toHaveBeenCalledWith(
    expect.objectContaining({ buildId: 'resolved-build-id' }),
  );
  expect(path).toContain('resolved-build-id');
  expect(logWarn).not.toHaveBeenCalled();
});

it('falls back to the cached build id when registry resolution fails', async () => {
  // A successful resolution first persists the build id to the cache.
  browsersMock.resolveBuildId.mockResolvedValueOnce('cached-build-id');
  await getExecutableBrowserPath({
    type: 'chrome',
    tag: 'stable',
    executablePath: undefined,
  });

  // A later run with an unreachable registry falls back to that cached id.
  const logWarn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  browsersMock.resolveBuildId.mockRejectedValueOnce(
    new Error('getaddrinfo ENOTFOUND googlechromelabs.github.io'),
  );

  const path = await getExecutableBrowserPath({
    type: 'chrome',
    tag: 'stable',
    executablePath: undefined,
  });

  expect(browsersMock.computeExecutablePath).toHaveBeenLastCalledWith(
    expect.objectContaining({ buildId: 'cached-build-id' }),
  );
  expect(path).toContain('cached-build-id');
  expect(logWarn).toHaveBeenCalledWith(
    expect.stringContaining('using the cached build ID cached-build-id'),
  );
});

it('throws when registry resolution fails without a cached build id', async () => {
  browsersMock.resolveBuildId.mockRejectedValueOnce(
    new Error('getaddrinfo ENOTFOUND googlechromelabs.github.io'),
  );

  await expect(
    getExecutableBrowserPath({
      type: 'chrome',
      tag: 'stable',
      executablePath: undefined,
    }),
  ).rejects.toThrow('ENOTFOUND');
});

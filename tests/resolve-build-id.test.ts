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
});

it('falls back to the bundled default version when registry resolution fails', async () => {
  const logWarn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  browsersMock.resolveBuildId.mockRejectedValueOnce(
    new Error('getaddrinfo ENOTFOUND googlechromelabs.github.io'),
  );

  const path = await getExecutableBrowserPath({
    type: 'chrome',
    tag: 'stable',
    executablePath: undefined,
  });

  // getDefaultBrowserTag() resolves to '100.0' under Vitest.
  expect(browsersMock.computeExecutablePath).toHaveBeenCalledWith(
    expect.objectContaining({ buildId: '100.0' }),
  );
  expect(path).toContain('100.0');
  expect(logWarn).toHaveBeenCalledWith(
    expect.stringContaining(
      'Falling back to the bundled default version chrome@100.0',
    ),
  );
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

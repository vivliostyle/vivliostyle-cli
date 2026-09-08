import fs from 'node:fs';

import { beforeEach, expect, it, vi } from 'vitest';

import type * as UtilModule from '../src/util.js';

const mockedRunContainer = vi.hoisted(() =>
  vi.fn<
    (options: { commandArgs: string[]; signal?: AbortSignal }) => Promise<void>
  >(),
);

vi.mock('../src/container.js', () => ({
  collectVolumeArgs: vi.fn<(args: string[]) => string[]>((args) => args),
  runContainer: mockedRunContainer,
  toContainerPath: vi.fn<(path: string) => string>((path) => path),
}));

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  isInContainer: vi.fn<() => boolean>(() => false),
}));

import { postProcessPDF } from '../src/output/pdf-postprocess.js';
import { runCleanupHandlers } from '../src/util.js';

const pdf = fs.readFileSync(new URL('fixtures/cmyk/text.pdf', import.meta.url));

beforeEach(() => {
  vi.clearAllMocks();
});

it('passes the signal to press-ready Docker preflight', async () => {
  const controller = new AbortController();

  await postProcessPDF({
    pdf,
    output: 'output.pdf',
    preflight: 'press-ready',
    preflightOption: [],
    image: 'vivliostyle/cli',
    cmyk: false,
    cmykMap: {},
    replaceImage: [],
    signal: controller.signal,
  });

  expect(mockedRunContainer).toHaveBeenCalledWith(
    expect.objectContaining({
      signal: controller.signal,
    }),
  );
});

it('waits for press-ready before removing the temporary preflight input', async () => {
  let finishPreflight: (() => void) | undefined;
  mockedRunContainer.mockReturnValue(
    new Promise<void>((resolve) => {
      finishPreflight = resolve;
    }),
  );

  const saving = postProcessPDF({
    pdf,
    output: 'output.pdf',
    preflight: 'press-ready',
    preflightOption: [],
    image: 'vivliostyle/cli',
    cmyk: false,
    cmykMap: {},
    replaceImage: [],
  });

  await vi.waitFor(() => {
    expect(mockedRunContainer).toHaveBeenCalledOnce();
  });
  const commandArgs = mockedRunContainer.mock.calls[0]?.[0].commandArgs;
  expect(commandArgs).toBeDefined();
  const input = commandArgs![commandArgs!.indexOf('-i') + 1];
  expect(input).toBeDefined();
  expect(fs.existsSync(input!)).toBe(true);

  let cleanupSettled = false;
  const cleanup = runCleanupHandlers().then(() => {
    cleanupSettled = true;
  });
  await Promise.resolve();

  expect(cleanupSettled).toBe(false);
  expect(fs.existsSync(input!)).toBe(true);

  finishPreflight?.();

  await saving;
  await cleanup;

  expect(fs.existsSync(input!)).toBe(false);
});

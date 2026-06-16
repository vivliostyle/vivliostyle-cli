import fs from 'node:fs';

import { beforeEach, expect, it, vi } from 'vitest';

import type * as UtilModule from '../src/util.js';

const mockedRunContainer = vi.hoisted(() =>
  vi.fn<
    (options: { commandArgs: string[]; signal?: AbortSignal }) => Promise<void>
  >(),
);
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<(message: string, handler: () => Promise<void>) => () => void>(),
);

vi.mock('../src/container.js', () => ({
  collectVolumeArgs: vi.fn<(args: string[]) => string[]>((args) => args),
  runContainer: mockedRunContainer,
  toContainerPath: vi.fn<(path: string) => string>((path) => path),
}));

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  isInContainer: vi.fn<() => boolean>(() => false),
  registerCleanupHandler: mockedRegisterCleanupHandler,
}));

import { PostProcess } from '../src/output/pdf-postprocess.js';

function createPostProcess(document: any) {
  return Object.assign(Object.create(PostProcess.prototype), {
    document,
  }) as PostProcess;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRegisterCleanupHandler.mockReturnValue(vi.fn<() => void>());
});

it('passes the signal to press-ready Docker preflight', async () => {
  const controller = new AbortController();
  const post = createPostProcess({
    save: vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([1])),
  });

  await post.save('output.pdf', {
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
  const unregisterCleanupHandler = vi.fn<() => void>();
  let cleanupHandler: (() => Promise<void>) | undefined;
  mockedRegisterCleanupHandler.mockImplementation((_message, handler) => {
    cleanupHandler = handler;
    return unregisterCleanupHandler;
  });
  const post = createPostProcess({
    save: vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([1])),
  });

  const saving = post.save('output.pdf', {
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
  expect(cleanupHandler).toBeDefined();
  const cleanup = cleanupHandler!().then(() => {
    cleanupSettled = true;
  });
  await Promise.resolve();

  expect(cleanupSettled).toBe(false);
  expect(fs.existsSync(input!)).toBe(true);

  finishPreflight?.();

  await saving;
  await cleanup;

  expect(unregisterCleanupHandler).toHaveBeenCalledOnce();
  expect(fs.existsSync(input!)).toBe(false);
});

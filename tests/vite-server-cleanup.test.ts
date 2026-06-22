import type {
  InlineConfig,
  PreviewServer,
  ResolvedConfig as ResolvedViteConfig,
  ViteDevServer,
} from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedVite = vi.hoisted(() => ({
  createServer: vi.fn<(config?: InlineConfig) => Promise<ViteDevServer>>(),
  preview: vi.fn<(config?: InlineConfig) => Promise<PreviewServer>>(),
}));
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<
    (
      message: string,
      handler: () => Promise<void>,
      options?: { prepend?: boolean },
    ) => () => (() => Promise<void>) | undefined
  >(),
);

vi.mock('vite', () => mockedVite);

vi.mock('../src/util.js', () => ({
  getDefaultEpubOpfPath: () => '',
  isValidUri: () => false,
  openEpub: async () => {},
  registerCleanupHandler: mockedRegisterCleanupHandler,
}));

vi.mock('../src/vite/vite-plugin-browser.js', () => ({
  vsBrowserPlugin: () => ({ name: 'browser' }),
}));

vi.mock('../src/vite/vite-plugin-dev-server.js', () => ({
  vsDevServerPlugin: () => ({ name: 'dev-server' }),
}));

vi.mock('../src/vite/vite-plugin-static-serve.js', () => ({
  vsStaticServePlugin: () => ({ name: 'static-serve' }),
}));

vi.mock('../src/vite/vite-plugin-viewer.js', () => ({
  vsViewerPlugin: () => ({ name: 'viewer' }),
}));

import type { ResolvedTaskConfig } from '../src/config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../src/config/schema.js';
import { createViteServer } from '../src/server.js';

const config = {
  serverRootDir: '/server',
  workspaceDir: '/workspace',
} as ResolvedTaskConfig;
const viteConfig = {
  server: {},
  preview: {},
  cacheDir: '/cache',
  root: '/server',
} as ResolvedViteConfig;
const inlineConfig = {} as ParsedVivliostyleInlineConfig;

describe('Vite server cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['preview', mockedVite.createServer],
    ['build', mockedVite.preview],
  ] as const)(
    'registers and shares %s server cleanup before launch completes',
    async (mode, launchServer) => {
      let resolveServer:
        | ((server: ViteDevServer | PreviewServer) => void)
        | undefined;
      const closeLaunchedServer = vi.fn<() => Promise<void>>(async () => {});
      const server = {
        close: closeLaunchedServer,
      } as unknown as ViteDevServer | PreviewServer;
      launchServer.mockReturnValueOnce(
        new Promise<ViteDevServer | PreviewServer>((resolve) => {
          resolveServer = resolve;
        }) as any,
      );
      let cleanupHandler: (() => Promise<void>) | undefined;
      mockedRegisterCleanupHandler.mockImplementationOnce(
        (_message, handler) => {
          cleanupHandler = handler;
          return () => {};
        },
      );

      const creatingServer = createViteServer({
        config,
        viteConfig,
        inlineConfig,
        mode,
      });

      expect(mockedRegisterCleanupHandler).toHaveBeenCalledWith(
        'Closing Vite server',
        expect.any(Function),
        { prepend: true },
      );
      const cleanup = cleanupHandler?.();
      expect(cleanup).toBeInstanceOf(Promise);
      expect(closeLaunchedServer).not.toHaveBeenCalled();

      resolveServer?.(server);
      const launchedServer = await creatingServer;
      await cleanup;

      const directClose = launchedServer.close();
      expect(directClose).toBe(cleanup);
      await directClose;
      expect(closeLaunchedServer).toHaveBeenCalledOnce();
    },
  );
});

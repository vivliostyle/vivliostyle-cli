import upath from 'upath';
import {
  type ConfigEnv,
  createLogger,
  defaultAllowedOrigins,
  type InlineConfig,
  mergeConfig as mergeViteConfig,
  type Plugin,
  resolveConfig,
  type ResolvedConfig as ResolvedViteConfig,
} from 'vite';
import { dim } from 'yoctocolors';

import { Logger } from '../logger.js';
import { useTmpDirectory } from '../util.js';
import type { ResolvedTaskConfig } from './resolve.js';

// Be careful not to confuse the preview/build commands of Vivliostyle CLI with Vite's mode.
// In Vivliostyle CLI, "preview" command starts the dev server in Vite,
// and "build" command starts the preview server in Vite.
const defaultConfigEnv: Record<'preview' | 'build', ConfigEnv> = {
  preview: { command: 'serve', mode: 'development', isPreview: false },
  build: { command: 'serve', mode: 'production', isPreview: true },
};

export function getRemoteViewerOrigin(
  viewer: string | undefined,
): string | undefined {
  if (!viewer || !URL.canParse(viewer)) {
    return undefined;
  }
  const { protocol, origin } = new URL(viewer);
  if (
    (protocol !== 'http:' && protocol !== 'https:') ||
    defaultAllowedOrigins.test(origin)
  ) {
    return undefined;
  }
  return origin;
}

/**
 * A remote viewer (e.g. `--viewer https://vivliostyle.org/viewer/`) fetches
 * the documents from the local server cross-origin. Chromium runs with
 * --disable-web-security, but Firefox enforces CORS, so allow the viewer's
 * origin in addition to Vite's default allowed origins. A `cors` option the
 * user configured is left untouched.
 */
function remoteViewerCorsPlugin(viewerOrigin: string): Plugin {
  return {
    name: 'vivliostyle:remote-viewer-cors',
    config(config) {
      if (config.server?.cors !== undefined) {
        return;
      }
      const cors = { origin: [defaultAllowedOrigins, viewerOrigin] };
      return {
        server: { cors },
        ...(config.preview?.cors === undefined && { preview: { cors } }),
      } satisfies InlineConfig;
    },
  };
}

export async function resolveViteConfig({
  serverRootDir,
  server,
  viteConfig,
  viteConfigFile,
  logLevel,
  workspaceDir,
  viewer,
  mode,
}: Pick<
  ResolvedTaskConfig,
  | 'serverRootDir'
  | 'server'
  | 'viteConfig'
  | 'viteConfigFile'
  | 'logLevel'
  | 'workspaceDir'
  | 'viewer'
> & {
  mode: 'preview' | 'build';
}): Promise<ResolvedViteConfig> {
  const viteLogger = createLogger(
    (
      {
        silent: 'silent',
        info: 'info',
        verbose: 'info',
        debug: 'info',
      } as const
    )[logLevel],
    { allowClearScreen: false },
  );
  const warnedMessages = new Set<string>();
  viteLogger.info = (msg) => {
    Logger.logInfo(`${dim('[vite]')} ${msg}`);
  };
  viteLogger.warn = (msg) => {
    viteLogger.hasWarned = true;
    Logger.logWarn(`${dim('[vite]')} ${msg}`);
  };
  viteLogger.warnOnce = (msg) => {
    if (warnedMessages.has(msg)) {
      return;
    }
    viteLogger.hasWarned = true;
    Logger.logWarn(`${dim('[vite]')} ${msg}`);
    warnedMessages.add(msg);
  };
  viteLogger.error = (msg) => {
    viteLogger.hasWarned = true;
    Logger.logError(`${dim('[vite]')} ${msg}`);
  };

  const root =
    typeof serverRootDir === 'string'
      ? serverRootDir
      : (await useTmpDirectory())[0];

  // When serverRootDir is not a string (UseTemporaryServerRoot symbol),
  // it means we're previewing an external URL or without input files.
  // In this case, we should use temporary directory for Vite cache
  // to avoid creating .vite directory in the current working directory.
  const cacheDir =
    typeof serverRootDir === 'string'
      ? upath.join(workspaceDir, '.vite')
      : upath.join(root, '.vite');

  const viewerOrigin = getRemoteViewerOrigin(viewer);
  const finalUserConfig = mergeViteConfig(viteConfig ?? {}, {
    server,
    preview: server,
    configFile: viteConfigFile === true ? undefined : viteConfigFile,
    root,
    customLogger: viteLogger,
    cacheDir,
    plugins: viewerOrigin ? [remoteViewerCorsPlugin(viewerOrigin)] : [],
  } satisfies InlineConfig);
  return resolveConfig(
    finalUserConfig,
    defaultConfigEnv[mode].command,
    defaultConfigEnv[mode].mode,
    'development',
    defaultConfigEnv[mode].isPreview,
  );
}

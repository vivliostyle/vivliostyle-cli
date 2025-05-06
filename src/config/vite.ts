import upath from 'upath';
import {
  ConfigEnv,
  createLogger,
  InlineConfig,
  mergeConfig as mergeViteConfig,
  resolveConfig,
  ResolvedConfig as ResolvedViteConfig,
} from 'vite';
import { dim } from 'yoctocolors';
import { Logger } from '../logger.js';
import { useTmpDirectory } from '../util.js';
import { ResolvedTaskConfig } from './resolve.js';

// Be careful not to confuse the preview/build commands of Vivliostyle CLI with Vite's mode.
// In Vivliostyle CLI, "preview" command starts the dev server in Vite,
// and "build" command starts the preview server in Vite.
const defaultConfigEnv: Record<'preview' | 'build', ConfigEnv> = {
  preview: { command: 'serve', mode: 'development', isPreview: false },
  build: { command: 'serve', mode: 'production', isPreview: true },
};

export async function resolveViteConfig({
  serverRootDir,
  server,
  viteConfig,
  viteConfigFile,
  logLevel,
  workspaceDir,
  mode,
}: Pick<
  ResolvedTaskConfig,
  | 'serverRootDir'
  | 'server'
  | 'viteConfig'
  | 'viteConfigFile'
  | 'logLevel'
  | 'workspaceDir'
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

  const finalUserConfig = mergeViteConfig(viteConfig || {}, {
    server,
    preview: server,
    configFile: viteConfigFile === true ? undefined : viteConfigFile,
    root,
    customLogger: viteLogger,
    cacheDir: upath.join(workspaceDir, '.vite'),
  } satisfies InlineConfig);
  return await resolveConfig(
    finalUserConfig,
    defaultConfigEnv[mode].command,
    defaultConfigEnv[mode].mode,
    'development',
    defaultConfigEnv[mode].isPreview,
  );
}

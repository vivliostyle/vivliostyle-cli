import * as v from 'valibot';
import * as vite from 'vite';
import { setupConfigFromFlags } from './commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from './config/load.js';
import { mergeInlineConfig } from './config/merge.js';
import { resolveTaskConfig } from './config/resolve.js';
import { VivliostyleInlineConfig } from './config/schema.js';
import { Logger } from './logger.js';
import { vsBrowserPlugin } from './vite/vite-plugin-browser.js';
import { vsDevServerPlugin } from './vite/vite-plugin-dev-server.js';
import { vsStaticServePlugin } from './vite/vite-plugin-static-serve.js';
import { vsViewerPlugin } from './vite/vite-plugin-viewer.js';

export async function createVitePlugin(
  inlineConfig: VivliostyleInlineConfig = {},
): Promise<vite.Plugin[]> {
  const parsedInlineConfig = v.parse(VivliostyleInlineConfig, inlineConfig);
  Logger.setLogLevel(parsedInlineConfig.logLevel);
  if (parsedInlineConfig.logger) {
    Logger.setCustomLogger(parsedInlineConfig.logger);
  } else {
    const { info, warn, error } = vite.createLogger('info', {
      prefix: '[vivliostyle]',
    });
    Logger.setCustomLogger({
      info: (msg) => info(msg, { timestamp: true }),
      warn: (msg) => warn(msg, { timestamp: true }),
      error: (msg) => error(msg, { timestamp: true }),
    });
  }
  Logger.debug('inlineConfig %O', parsedInlineConfig);
  const vivliostyleConfig =
    (await loadVivliostyleConfig(parsedInlineConfig)) ??
    setupConfigFromFlags(parsedInlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  const { tasks, inlineOptions } = mergeInlineConfig(
    vivliostyleConfig,
    parsedInlineConfig,
  );
  const config = resolveTaskConfig(tasks[0], inlineOptions);
  Logger.debug('config %O', config);

  return [
    vsDevServerPlugin({ config, inlineConfig: parsedInlineConfig }),
    vsViewerPlugin({ config, inlineConfig: parsedInlineConfig }),
    vsBrowserPlugin({ config, inlineConfig: parsedInlineConfig }),
    vsStaticServePlugin({ config, inlineConfig: parsedInlineConfig }),
  ];
}

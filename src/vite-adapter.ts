import * as v from 'valibot';
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
  _inlineConfig: VivliostyleInlineConfig = {},
): Promise<import('vite').Plugin[]> {
  const inlineConfig = v.parse(VivliostyleInlineConfig, _inlineConfig);
  Logger.debug('inlineConfig %O', inlineConfig);
  const vivliostyleConfig =
    (await loadVivliostyleConfig(inlineConfig)) ??
    setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  const { tasks, inlineOptions } = mergeInlineConfig(
    vivliostyleConfig,
    inlineConfig,
  );
  const config = resolveTaskConfig(tasks[0], inlineOptions);
  Logger.debug('config %O', config);

  return [
    vsDevServerPlugin({ config, inlineConfig }),
    vsViewerPlugin({ config, inlineConfig }),
    vsBrowserPlugin({ config, inlineConfig }),
    vsStaticServePlugin({ config, inlineConfig }),
  ];
}

import * as v from 'valibot';
import { setupConfigFromFlags } from './commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from './config/load.js';
import { mergeInlineConfig } from './config/merge.js';
import { resolveTaskConfig } from './config/resolve.js';
import { VivliostyleInlineConfig } from './config/schema.js';
import { vsBrowserPlugin } from './vite/vite-plugin-browser.js';
import { vsDevServerPlugin } from './vite/vite-plugin-dev-server.js';
import { vsViewerPlugin } from './vite/vite-plugin-viewer.js';

export async function createVitePlugin(
  inlineConfig: VivliostyleInlineConfig = {},
): Promise<import('vite').Plugin[]> {
  const parsed = v.parse(VivliostyleInlineConfig, inlineConfig);
  const vivliostyleConfig =
    (await loadVivliostyleConfig({
      configPath: parsed.config,
      cwd: parsed.cwd,
    })) ?? setupConfigFromFlags(parsed);
  warnDeprecatedConfig(vivliostyleConfig);
  const { tasks, inlineOptions: options } = mergeInlineConfig(
    vivliostyleConfig,
    parsed,
  );
  const config = resolveTaskConfig(tasks[0], options);

  return [
    vsDevServerPlugin({ config, options }),
    vsViewerPlugin({ config, options }),
    vsBrowserPlugin({ config, options }),
  ];
}

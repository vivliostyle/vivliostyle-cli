import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig } from '../config/load.js';
import { mergeConfig } from '../config/merge.js';
import { ResolvedTaskConfig, resolveTaskConfig } from '../config/resolve.js';
import { InlineOptions } from '../config/schema.js';
// import { mergeConfig, MergedConfig } from '../input/config.js';

const headStartTagRe = /<head[^>]*>/i;
export const prependToHead = (html: string, content: string) =>
  html.replace(headStartTagRe, (match) => `${match}\n${content}`);

export async function reloadConfig(
  prevConfig: ResolvedTaskConfig,
  options: InlineOptions,
) {
  let config =
    (await loadVivliostyleConfig({
      configPath: options.config,
      cwd: options.cwd,
    })) ?? setupConfigFromFlags(options);
  config = mergeConfig(config, {
    temporaryFilePrefix: prevConfig.temporaryFilePrefix,
  });
  const taskConfig = resolveTaskConfig(config.tasks[0], config.inlineOptions);
  return taskConfig;
}

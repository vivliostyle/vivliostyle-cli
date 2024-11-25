import {
  CliFlags,
  loadVivliostyleConfig,
  mergeConfig,
  MergedConfig,
} from '../input/config.js';

const headStartTagRe = /<head[^>]*>/i;
export const prependToHead = (html: string, content: string) =>
  html.replace(headStartTagRe, (match) => `${match}\n${content}`);

export async function reloadConfig({
  cliFlags,
  context,
  prevConfig,
}: {
  cliFlags: CliFlags;
  context: string;
  prevConfig?: MergedConfig;
}) {
  const jsConfig = cliFlags.configPath
    ? [await loadVivliostyleConfig(cliFlags.configPath)].flat()[0]
    : undefined;
  return await mergeConfig(cliFlags, jsConfig, context, prevConfig);
}

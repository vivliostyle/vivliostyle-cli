import {
  CliFlags,
  loadVivliostyleConfig,
  mergeConfig,
  MergedConfig,
} from '../input/config.js';

const headStartTagRe = /<head[^>]*>/i;
export const prependToHead = (html: string, content: string) =>
  html.replace(headStartTagRe, (match) => `${match}\n${content}`);

export async function loadConfig({
  cliFlags,
  context,
}: {
  cliFlags: CliFlags;
  context: string;
}): Promise<MergedConfig> {
  const jsConfig = cliFlags.configPath
    ? [await loadVivliostyleConfig(cliFlags.configPath)].flat()[0]
    : undefined;
  return await mergeConfig(cliFlags, jsConfig, context);
}

export async function reloadConfig(prevConfig: MergedConfig) {
  const jsConfig = prevConfig.cliFlags.configPath
    ? [await loadVivliostyleConfig(prevConfig.cliFlags.configPath)].flat()[0]
    : undefined;
  return await mergeConfig(
    prevConfig.cliFlags,
    jsConfig,
    prevConfig.context,
    prevConfig,
  );
}

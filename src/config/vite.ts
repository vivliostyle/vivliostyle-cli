import { loadConfigFromFile, mergeConfig as mergeViteConfig } from 'vite';
import { ResolvedTaskConfig } from './resolve.js';

export async function prepareViteConfig({
  context,
  vite,
  viteConfigFile,
}: ResolvedTaskConfig) {
  let viteConfig =
    (viteConfigFile &&
      (
        await loadConfigFromFile(
          { command: 'serve', mode: 'development' },
          typeof viteConfigFile === 'string' ? viteConfigFile : undefined,
          context,
        )
      )?.config) ||
    {};
  viteConfig = mergeViteConfig(viteConfig, vite || {});
  return viteConfig;
}

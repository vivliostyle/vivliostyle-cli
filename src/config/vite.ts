import { loadConfigFromFile, mergeConfig as mergeViteConfig } from 'vite';
import { ResolvedTaskConfig } from './resolve.js';

export async function prepareViteConfig({
  context,
  vite,
  viteConfigFile,
}: ResolvedTaskConfig) {
  const loadedViteConfig =
    viteConfigFile &&
    (
      await loadConfigFromFile(
        { command: 'serve', mode: 'development' },
        typeof viteConfigFile === 'string' ? viteConfigFile : undefined,
        context,
      )
    )?.config;
  const viteConfig = mergeViteConfig(loadedViteConfig || {}, vite || {});
  return { viteConfig, viteConfigLoaded: !!loadedViteConfig };
}

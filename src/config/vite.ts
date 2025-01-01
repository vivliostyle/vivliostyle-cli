import {
  ConfigEnv,
  loadConfigFromFile,
  mergeConfig as mergeViteConfig,
  resolveConfig,
  UserConfig,
} from 'vite';
import { ResolvedTaskConfig } from './resolve.js';

// Be careful not to confuse the preview/build commands of Vivliostyle CLI with Vite's mode.
// In Vivliostyle CLI, "preview" command starts the dev server in Vite,
// and "build" command starts the preview server in Vite.
const defaultConfigEnv: Record<'preview' | 'build', ConfigEnv> = {
  preview: { command: 'serve', mode: 'development', isPreview: false },
  build: { command: 'serve', mode: 'production', isPreview: true },
};

export async function prepareViteConfig({
  context,
  viteConfig: overrideViteConfig,
  viteConfigFile,
  mode,
}: Pick<ResolvedTaskConfig, 'context' | 'viteConfig' | 'viteConfigFile'> & {
  mode: 'preview' | 'build';
}): Promise<{
  viteConfig: UserConfig;
  viteConfigLoaded: boolean;
}> {
  const loadedViteConfig =
    viteConfigFile &&
    (
      await loadConfigFromFile(
        defaultConfigEnv[mode],
        typeof viteConfigFile === 'string' ? viteConfigFile : undefined,
        context,
      )
    )?.config;
  const viteConfig = mergeViteConfig(
    loadedViteConfig || {},
    overrideViteConfig || {},
  );
  return { viteConfig, viteConfigLoaded: !!loadedViteConfig };
}

export async function resolveViteConfig(
  userConfig: UserConfig,
  mode: 'preview' | 'build',
) {
  const env = defaultConfigEnv[mode];
  return await resolveConfig(
    userConfig,
    env.command,
    env.mode,
    undefined,
    env.isPreview,
  );
}

import { CliFlags } from './input/config.js';
import { loadConfig } from './vite/plugin-util.js';
import { vsDevServerPlugin } from './vite/vite-plugin-dev-server.js';
import { vsViewerPlugin } from './vite/vite-plugin-viewer.js';

export async function createVitePlugin({
  cliFlags = {},
  context = process.cwd(),
}: {
  cliFlags?: CliFlags;
  context?: string;
} = {}) {
  const config = await loadConfig({ cliFlags, context });
  return [
    vsDevServerPlugin({ config }),
    vsViewerPlugin({ config }),
    // vsBrowserPlugin({ config }),
  ];
}

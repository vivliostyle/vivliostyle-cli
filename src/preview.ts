import { AddressInfo } from 'node:net';
import upath from 'upath';
import { CliFlags, collectVivliostyleConfig } from './input/config.js';
import { createViteServer } from './server.js';
import { cwd } from './util.js';

export interface PreviewCliFlags extends CliFlags {}

export async function preview(cliFlags: PreviewCliFlags) {
  const { cliFlags: resolvedCliFlags } =
    await collectVivliostyleConfig(cliFlags);
  const { configPath } = resolvedCliFlags;
  const context = configPath ? upath.dirname(configPath) : cwd;
  const viteServer = await createViteServer({
    cliFlags: resolvedCliFlags,
    context,
  });
  const dev = await viteServer.listen(13000);
  const { port } = dev.httpServer!.address() as AddressInfo;
  console.log(`Vite server running at http://localhost:${port}`);
}

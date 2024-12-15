import { AddressInfo } from 'node:net';
import upath from 'upath';
import { CliFlags, collectVivliostyleConfig } from './input/config.js';
import { createViteServer } from './server.js';
import { cwd } from './util.js';

export interface PreviewCliFlags extends CliFlags {}

/**
 * @param cliFlags
 * @returns
 */
export async function preview(cliFlags: PreviewCliFlags) {
  const { cliFlags: resolvedCliFlags } =
    await collectVivliostyleConfig(cliFlags);
  const { configPath } = resolvedCliFlags;
  const context = configPath ? upath.dirname(configPath) : cwd;
  const { server } = await createViteServer({
    cliFlags: resolvedCliFlags,
    context,
  });
  const dev = await server.listen(server.config.server.port);
  const { port } = dev.httpServer!.address() as AddressInfo;
  console.log(`Vite server running at http://localhost:${port}`);
}

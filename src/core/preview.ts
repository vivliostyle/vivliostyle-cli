import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeInlineConfig } from '../config/merge.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { createViteServer } from '../server.js';

export async function preview(inlineConfig: ParsedVivliostyleInlineConfig) {
  let vivliostyleConfig =
    (await loadVivliostyleConfig({
      configPath: inlineConfig.config,
      cwd: inlineConfig.cwd,
    })) ?? setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, inlineConfig);
  const { server } = await createViteServer({ vivliostyleConfig });
  const dev = await server.listen();
  const { port } = dev.httpServer!.address() as { port: number };
  console.log(`Vite server running at http://localhost:${port}`);
}

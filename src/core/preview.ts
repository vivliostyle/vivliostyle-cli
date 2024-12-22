import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeInlineConfig } from '../config/merge.js';
import { resolveTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { createViteServer } from '../server.js';
import { setLogLevel } from '../util.js';

export async function preview(inlineConfig: ParsedVivliostyleInlineConfig) {
  setLogLevel(inlineConfig.logLevel);

  const vivliostyleConfig =
    (await loadVivliostyleConfig({
      configPath: inlineConfig.config,
      cwd: inlineConfig.cwd,
    })) ?? setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  const { tasks, inlineOptions } = mergeInlineConfig(
    vivliostyleConfig,
    inlineConfig,
  );
  // Only show preview of first entry
  const config = resolveTaskConfig(tasks[0], inlineOptions);
  const { server } = await createViteServer({ config, inlineOptions });
  const dev = await server.listen();
  const { port } = dev.httpServer!.address() as { port: number };
  console.log(`Vite server running at http://localhost:${port}`);
}

import terminalLink from 'terminal-link';
import { ViteDevServer } from 'vite';
import { blueBright, cyan, dim } from 'yoctocolors';
import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeConfig, mergeInlineConfig } from '../config/merge.js';
import { resolveTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { resolveViteConfig } from '../config/vite.js';
import { cliVersion } from '../const.js';
import { isUnicodeSupported, Logger, randomBookSymbol } from '../logger.js';
import { createViteServer, getViewerFullUrl } from '../server.js';

export async function preview(inlineConfig: ParsedVivliostyleInlineConfig) {
  Logger.setLogLevel(inlineConfig.logLevel);
  Logger.setCustomLogger(inlineConfig.logger);
  Logger.debug('preview > inlineConfig %O', inlineConfig);

  let vivliostyleConfig =
    (await loadVivliostyleConfig(inlineConfig)) ??
    setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, inlineConfig);
  const { tasks, inlineOptions } = vivliostyleConfig;
  Logger.debug('preview > vivliostyleConfig %O', vivliostyleConfig);

  // Only show preview of first entry
  let config = resolveTaskConfig(tasks[0], inlineOptions);
  Logger.debug('preview > config %O', config);

  let server: ViteDevServer;
  let url: string;
  {
    using _ = Logger.startLogging('Start preview');
    const viteConfig = await resolveViteConfig({
      ...config,
      mode: 'preview',
    });
    server = await createViteServer({
      config,
      viteConfig,
      inlineConfig,
      mode: 'preview',
    });
    if (server.httpServer) {
      await server.listen();
      vivliostyleConfig = mergeConfig(vivliostyleConfig, {
        temporaryFilePrefix: config.temporaryFilePrefix,
        server: server.config.server,
      });
      config = resolveTaskConfig(
        vivliostyleConfig.tasks[0],
        vivliostyleConfig.inlineOptions,
      );
    }
    url = await getViewerFullUrl(config);
  }

  if (server.httpServer) {
    Logger.log(`
${cyan(`Vivliostyle CLI v${cliVersion}`)}
${blueBright('║')} ${isUnicodeSupported ? `${randomBookSymbol} ` : ''}Up and running (press Ctrl+C to quit)
${blueBright('╙─')} ${dim(`Preview URL: ${terminalLink(url, url, { fallback: () => url })}`)}
`);
  }
  return server;
}

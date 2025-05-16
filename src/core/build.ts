import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { PreviewServer, build as viteBuild } from 'vite';
import { cyan, gray } from 'yoctocolors';
import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeInlineConfig } from '../config/merge.js';
import { isWebPubConfig, resolveTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { resolveViteConfig } from '../config/vite.js';
import { buildPDFWithContainer } from '../container.js';
import { isUnicodeSupported, Logger, randomBookSymbol } from '../logger.js';
import { buildPDF } from '../output/pdf.js';
import { buildWebPublication } from '../output/webbook.js';
import {
  cleanupWorkspace,
  compile,
  copyAssets,
  prepareThemeDirectory,
} from '../processor/compile.js';
import { createViteServer } from '../server.js';
import { cwd, runExitHandlers } from '../util.js';

export async function build(
  inlineConfig: ParsedVivliostyleInlineConfig,
  { containerForkMode = false }: { containerForkMode?: boolean } = {},
) {
  Logger.setLogLevel(inlineConfig.logLevel);
  Logger.setCustomLogger(inlineConfig.logger);
  if (containerForkMode) {
    Logger.setLogPrefix(gray('[Docker]'));
  }
  Logger.debug('build > inlineConfig %O', inlineConfig);

  let vivliostyleConfig =
    (await loadVivliostyleConfig(inlineConfig)) ??
    setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, {
    ...inlineConfig,
    quick: false,
  });
  const { inlineOptions } = vivliostyleConfig;
  Logger.debug('build > vivliostyleConfig %O', vivliostyleConfig);

  for (let [i, task] of vivliostyleConfig.tasks.entries()) {
    using _ = Logger.startLogging('Start building');

    const config = resolveTaskConfig(task, inlineOptions);
    Logger.debug('build > config %O', config);
    const viteConfig = await resolveViteConfig({
      ...config,
      mode: 'build',
    });

    let server: PreviewServer | undefined;
    if (!containerForkMode) {
      // build dependents first
      Logger.debug('build > viteConfig.configFile %s', viteConfig.configFile);
      if (viteConfig.configFile && typeof config.serverRootDir === 'string') {
        using _ = Logger.suspendLogging('Building Vite project');
        await viteBuild({
          configFile: viteConfig.configFile,
          root: config.serverRootDir,
        });
      }

      server = await createViteServer({
        config,
        viteConfig,
        inlineConfig,
        mode: 'build',
      });

      // build artifacts
      if (isWebPubConfig(config)) {
        await cleanupWorkspace(config);
        await prepareThemeDirectory(config);
        await compile(config);
        await copyAssets(config);
      }
    }

    // generate files
    for (const target of config.outputs) {
      let output: string | null = null;
      const { format } = target;
      if (format === 'pdf') {
        if (!containerForkMode && target.renderMode === 'docker') {
          output = await buildPDFWithContainer({
            target,
            config,
            inlineConfig,
          });
        } else {
          output = await buildPDF({ target, config });
        }
      } else if (format === 'webpub' || format === 'epub') {
        output = await buildWebPublication({ target, config });
      }
      if (output && !containerForkMode) {
        const formattedOutput = cyan(
          upath.relative(inlineConfig.cwd ?? cwd, output),
        );
        Logger.logSuccess(
          `Finished building ${terminalLink(
            formattedOutput,
            pathToFileURL(output).href,
            {
              fallback: () => formattedOutput,
            },
          )}`,
        );
      }
    }

    await server?.close();
  }

  runExitHandlers();
  if (!containerForkMode) {
    const num = vivliostyleConfig.tasks.flatMap((t) => t.output ?? []).length;
    const symbol = isUnicodeSupported
      ? `${num > 1 ? '📚' : randomBookSymbol} `
      : '';
    Logger.log(`${symbol}Built successfully!`);
  }
}

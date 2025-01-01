import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { PreviewServer, build as viteBuild } from 'vite';
import { cyan } from 'yoctocolors';
import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeConfig, mergeInlineConfig } from '../config/merge.js';
import { isWebPubConfig, resolveTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { prepareViteConfig, resolveViteConfig } from '../config/vite.js';
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
import { cwd, isInContainer, runExitHandlers } from '../util.js';

export async function build(inlineConfig: ParsedVivliostyleInlineConfig) {
  Logger.setLogLevel(inlineConfig.logLevel);

  let vivliostyleConfig =
    (await loadVivliostyleConfig({
      configPath: inlineConfig.config,
      cwd: inlineConfig.cwd,
    })) ?? setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, {
    ...inlineConfig,
    quick: false,
  });
  const { inlineOptions } = vivliostyleConfig;

  for (let [i, task] of vivliostyleConfig.tasks.entries()) {
    using _ = Logger.startLogging('Start building');

    let config = resolveTaskConfig(task, inlineOptions);
    const { viteConfig, viteConfigLoaded } = await prepareViteConfig({
      ...config,
      mode: 'build',
    });
    const resolvedViteConfig = await resolveViteConfig(viteConfig, 'build');

    // reload config to get the latest server URL
    vivliostyleConfig = mergeConfig(vivliostyleConfig, {
      server: resolvedViteConfig.preview,
    });
    task = vivliostyleConfig.tasks[i];
    config = resolveTaskConfig(task, inlineOptions);

    let server: PreviewServer | undefined;
    if (!isInContainer()) {
      // build dependents first
      if (viteConfigLoaded) {
        using _ = Logger.suspendLogging('Building Vite project');
        await viteBuild(viteConfig);
      }

      server = await createViteServer({
        config,
        inlineOptions,
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
        if (!isInContainer() && target.renderMode === 'docker') {
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
      if (output && !isInContainer()) {
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
  if (!isInContainer()) {
    const num = vivliostyleConfig.tasks.flatMap((t) => t.output ?? []).length;
    const symbol = isUnicodeSupported
      ? `${num > 1 ? '📚' : randomBookSymbol} `
      : '';
    Logger.log(`${symbol}Built successfully!`);
  }
}

import chalk from 'chalk';
import { log } from 'console';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { build as viteBuild } from 'vite';
import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeConfig, mergeInlineConfig } from '../config/merge.js';
import { isWebPubConfig, resolveTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { prepareViteConfig } from '../config/vite.js';
import { buildPDFWithContainer } from '../container.js';
import { buildPDF } from '../output/pdf.js';
import { buildWebPublication } from '../output/webbook.js';
import {
  cleanupWorkspace,
  compile,
  copyAssets,
  prepareThemeDirectory,
} from '../processor/compile.js';
import { listenVitePreviewServer } from '../server.js';
import {
  cwd,
  isInContainer,
  runExitHandlers,
  setLogLevel,
  startLogging,
} from '../util.js';

export async function build(inlineConfig: ParsedVivliostyleInlineConfig) {
  setLogLevel(inlineConfig.logLevel);

  // TODO
  /*
  if (cliFlags.bypassedPdfBuilderOption) {
    const option = JSON.parse(cliFlags.bypassedPdfBuilderOption);
    // Host doesn't know browser path inside of container
    option.executableBrowser = getExecutableBrowserPath(
      option.browserType ?? 'chromium',
    );
    debug('bypassedPdfBuilderOption', option);

    const stopLogging = startLogging();
    await buildPDF(option);
    // Stop remaining stream output and kill process
    stopLogging();

    teardownServer();
    return;
  }
  */

  const stopLogging = startLogging('Collecting build config');

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
    let config = resolveTaskConfig(task, inlineOptions);

    // build dependents first
    const { viteConfig, viteConfigLoaded } = await prepareViteConfig(config);
    if (viteConfigLoaded) {
      await viteBuild(viteConfig);
    }

    const server = await listenVitePreviewServer({ config, inlineOptions });

    // reload config to get the latest server URL
    vivliostyleConfig = mergeConfig(vivliostyleConfig, {
      server: server.config.preview,
    });
    task = vivliostyleConfig.tasks[i];
    config = resolveTaskConfig(task, inlineOptions);

    // build artifacts
    if (isWebPubConfig(config)) {
      await cleanupWorkspace(config);
      await prepareThemeDirectory(config);
      await compile(config);
      await copyAssets(config);
    }

    // generate files
    for (const target of config.outputs) {
      let output: string | null = null;
      const { format } = target;
      if (format === 'pdf') {
        if (!isInContainer() && target.renderMode === 'docker') {
          output = await buildPDFWithContainer();
        } else {
          output = await buildPDF({ target, config });
        }
      } else if (format === 'webpub' || format === 'epub') {
        output = await buildWebPublication({ target, config });
      }
      if (output) {
        const formattedOutput = chalk.bold.green(
          upath.relative(inlineConfig.cwd ?? cwd, output),
        );
        log(
          `\n${terminalLink(formattedOutput, 'file://' + output, {
            fallback: () => formattedOutput,
          })} has been created.`,
        );
      }
    }

    await server.close();
  }

  runExitHandlers();
  stopLogging('Built successfully.', '🎉');
}

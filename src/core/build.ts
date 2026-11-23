import { pathToFileURL } from 'node:url';

import terminalLink from 'terminal-link';
import upath from 'upath';
import { type PreviewServer, build as viteBuild } from 'vite';
import { cyan, gray } from 'yoctocolors';

import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeConfig, mergeInlineConfig } from '../config/merge.js';
import { isWebPubConfig, resolveTaskConfig } from '../config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { resolveViteConfig } from '../config/vite.js';
import { buildPDFWithContainer } from '../container.js';
import { isUnicodeSupported, Logger, randomBookSymbol } from '../logger.js';
import { buildPDF } from '../output/pdf.js';
import { buildWebPublication } from '../output/webbook.js';
import { copyAssets } from '../processor/asset.js';
import {
  cleanupWorkspace,
  compile,
  prepareThemeDirectory,
} from '../processor/compile.js';
import { validateThemeCssDependencies } from '../processor/css.js';
import { createViteServer, generateCmykReserveMap } from '../server.js';
import { cwd, runCleanupHandlers } from '../util.js';

export async function build(
  inlineConfig: ParsedVivliostyleInlineConfig,
  { containerForkMode = false }: { containerForkMode?: boolean } = {},
): Promise<void> {
  Logger.setLogOptions({ ...inlineConfig, containerForkMode });
  if (containerForkMode) {
    Logger.setLogPrefix(gray('[Docker]'));
  }
  Logger.debug('build > inlineConfig %O', inlineConfig);

  let vivliostyleConfig =
    (await loadVivliostyleConfig(inlineConfig)) ??
    setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig, inlineConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, {
    ...inlineConfig,
    quick: false,
  });
  const { inlineOptions } = vivliostyleConfig;
  Logger.debug('build > vivliostyleConfig %O', vivliostyleConfig);

  for (const [i, task] of vivliostyleConfig.tasks.entries()) {
    using _ = Logger.startLogging('Start building');

    let config = resolveTaskConfig(task, inlineOptions);
    if (config.browser.url) {
      if (
        containerForkMode ||
        config.outputs.some(
          (target) => target.format === 'pdf' && target.renderMode === 'docker',
        )
      ) {
        throw new Error(
          '--browser-url cannot be used with Docker PDF rendering.',
        );
      }
      if (config.browser.type === 'firefox') {
        throw new Error(
          '--browser-url requires Chromium and cannot be used with Firefox.',
        );
      }
      const launchOptions = [
        config.browser.executablePath && '--executable-browser',
        task.browser?.tag && '--browser with a version',
        inlineOptions.sandbox && '--sandbox',
        inlineOptions.proxyServer && '--proxy-server',
        inlineOptions.proxyBypass && '--proxy-bypass',
        inlineOptions.proxyUser && '--proxy-user',
        inlineOptions.proxyPass && '--proxy-pass',
        inlineOptions.ignoreHttpsErrors && '--ignore-https-errors',
      ].filter(Boolean);
      if (launchOptions.length > 0) {
        throw new Error(
          `--browser-url cannot be used with ${launchOptions.join(', ')}. Configure the running Chromium when launching it.`,
        );
      }
    }
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

      if (!inlineConfig.disableServerStartup) {
        server = await createViteServer({
          config,
          viteConfig,
          inlineConfig,
          mode: 'build',
        });

        const addressInfo = server.httpServer?.address();
        if (addressInfo && typeof addressInfo !== 'string') {
          const actualPort = addressInfo.port;
          vivliostyleConfig = mergeConfig(vivliostyleConfig, {
            temporaryFilePrefix: config.temporaryFilePrefix,
            server: {
              ...server.config.preview,
              port: actualPort,
            },
          });
          config = resolveTaskConfig(
            vivliostyleConfig.tasks[i],
            vivliostyleConfig.inlineOptions,
          );
        }
      }

      // build artifacts
      if (isWebPubConfig(config)) {
        await cleanupWorkspace(config);
        await prepareThemeDirectory(config, inlineConfig.signal);
        await validateThemeCssDependencies(config);
        await compile(config);
        await copyAssets(config);
      }

      // Write CMYK reserve map if configured
      generateCmykReserveMap(config);
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
          output = await buildPDF({
            target,
            config,
            signal: inlineConfig.signal,
          });
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

  await runCleanupHandlers();
  if (!containerForkMode) {
    const num = vivliostyleConfig.tasks.flatMap((t) => t.output ?? []).length;
    const symbol = isUnicodeSupported
      ? `${num > 1 ? '📚' : randomBookSymbol} `
      : '';
    Logger.log(`${symbol}Built successfully!`);
  }
}

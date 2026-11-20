import { pathToFileURL } from 'node:url';

import debug from 'debug';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { type PreviewServer, build as viteBuild } from 'vite';
import { cyan, gray } from 'yoctocolors';

import type { WorkerPdfRenderer } from '../browser-worker/client.js';
import { setupConfigFromFlags } from '../commands/cli-flags.js';
import { loadVivliostyleConfig, warnDeprecatedConfig } from '../config/load.js';
import { mergeConfig, mergeInlineConfig } from '../config/merge.js';
import { isWebPubConfig, resolveTaskConfig } from '../config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { resolveViteConfig } from '../config/vite.js';
import { buildPDFWithContainer } from '../container.js';
import { isUnicodeSupported, Logger, randomBookSymbol } from '../logger.js';
import { buildPDF } from '../output/pdf.js';
import { copyAssets } from '../processor/asset.js';
import { validateThemeCssDependencies } from '../processor/css.js';
import { createViteServer, generateCmykReserveMap } from '../server.js';
import { cwd, runCleanupHandlers } from '../util.js';

const buildTiming = debug('vs-cli:build-timing');

export async function build(
  inlineConfig: ParsedVivliostyleInlineConfig,
  {
    containerForkMode = false,
    renderWithWorker,
  }: { containerForkMode?: boolean; renderWithWorker?: WorkerPdfRenderer } = {},
): Promise<void> {
  Logger.setLogOptions({ ...inlineConfig, containerForkMode });
  if (containerForkMode) {
    Logger.setLogPrefix(gray('[Docker]'));
  }
  Logger.debug('build > inlineConfig %O', inlineConfig);

  const configStart = performance.now();
  let vivliostyleConfig =
    (await loadVivliostyleConfig(inlineConfig)) ??
    setupConfigFromFlags(inlineConfig);
  warnDeprecatedConfig(vivliostyleConfig, inlineConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, {
    ...inlineConfig,
    quick: false,
  });
  const { inlineOptions } = vivliostyleConfig;
  buildTiming(
    'Build configuration configMs=%d',
    Math.round(performance.now() - configStart),
  );
  Logger.debug('build > vivliostyleConfig %O', vivliostyleConfig);

  for (const [i, task] of vivliostyleConfig.tasks.entries()) {
    using _ = Logger.startLogging('Start building');

    let config = resolveTaskConfig(task, inlineOptions);
    Logger.debug('build > config %O', config);
    inlineConfig.signal?.throwIfAborted();
    if (
      renderWithWorker &&
      config.outputs.some((target) => target.format === 'pdf')
    ) {
      if (
        config.outputs.some(
          (target) => target.format === 'pdf' && target.renderMode === 'docker',
        )
      ) {
        throw new Error(
          '--browser-worker cannot be used with Docker PDF rendering.',
        );
      }
      if (config.browser.type === 'firefox') {
        throw new Error(
          '--browser-worker requires Chrome or Chromium. Firefox is unsupported.',
        );
      }
    }
    const viteConfigStart = performance.now();
    const viteConfig = await resolveViteConfig({
      ...config,
      mode: 'build',
    });
    buildTiming(
      'Build Vite configuration viteConfigMs=%d',
      Math.round(performance.now() - viteConfigStart),
    );
    inlineConfig.signal?.throwIfAborted();

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
        inlineConfig.signal?.throwIfAborted();
      }

      if (!inlineConfig.disableServerStartup) {
        const viteStart = performance.now();
        server = await createViteServer({
          config,
          viteConfig,
          inlineConfig,
          mode: 'build',
        });
        buildTiming(
          'Build Vite startup viteStartupMs=%d',
          Math.round(performance.now() - viteStart),
        );
        inlineConfig.signal?.throwIfAborted();

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
        const compileStart = performance.now();
        inlineConfig.signal?.throwIfAborted();
        const { cleanupWorkspace, compile, prepareThemeDirectory } =
          await import('../processor/compile.js');
        inlineConfig.signal?.throwIfAborted();
        await cleanupWorkspace(config);
        await prepareThemeDirectory(config, inlineConfig.signal);
        await validateThemeCssDependencies(config);
        await compile(config);
        await copyAssets(config);
        buildTiming(
          'Build compilation compileMs=%d',
          Math.round(performance.now() - compileStart),
        );
      }

      // Write CMYK reserve map if configured
      generateCmykReserveMap(config);
    }

    // generate files
    for (const target of config.outputs) {
      inlineConfig.signal?.throwIfAborted();
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
            renderWithWorker,
          });
        }
      } else if (format === 'webpub' || format === 'epub') {
        const { buildWebPublication } = await import('../output/webbook.js');
        inlineConfig.signal?.throwIfAborted();
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

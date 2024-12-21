import { ParsedVivliostyleInlineConfig } from '../config/schema.js';

export async function build(inlineConfig: ParsedVivliostyleInlineConfig) {
  // TODO
  /*
  setLogLevel(cliFlags.logLevel);

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

  const isInContainer = checkContainerEnvironment();
  const stopLogging = startLogging('Collecting build config');
  const configEntries = await getFullConfig(cliFlags);

  for (const config of configEntries) {
    // build artifacts
    if (config.manifestPath) {
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
        if (!isInContainer && target.renderMode === 'docker') {
          output = await buildPDFWithContainer({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryUrl ??
              config.epubOpfPath) as string,
            target,
          });
        } else {
          output = await buildPDF({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryUrl ??
              config.epubOpfPath) as string,
            target,
          });
        }
      } else if (format === 'webpub' || format === 'epub') {
        output = await buildWebPublication({
          ...config,
          target,
        });
      }
      if (output) {
        const formattedOutput = chalk.bold.green(upath.relative(cwd, output));
        log(
          `\n${terminalLink(formattedOutput, 'file://' + output, {
            fallback: () => formattedOutput,
          })} has been created.`,
        );
      }
    }

    teardownServer();
  }

  runExitHandlers();
  stopLogging('Built successfully.', '🎉');
  */
}

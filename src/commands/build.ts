import process from 'node:process';
import { build } from '../build.js';
import { gracefulError } from '../util.js';
import { setupBuildParserProgram } from './build.parser.js';

try {
  const program = setupBuildParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  console.log(options);
  build({
    input: program.args?.[0],
    configPath: options.config,
    targets: options.targets,
    theme: options.theme,
    size: options.size,
    cropMarks: options.cropMarks,
    bleed: options.bleed,
    cropOffset: options.cropOffset,
    css: options.css,
    style: options.style,
    userStyle: options.userStyle,
    singleDoc: options.singleDoc,
    title: options.title,
    author: options.author,
    language: options.language,
    pressReady: options.pressReady,
    readingProgression: options.readingProgression,
    renderMode: options.renderMode || 'local',
    preflight: options.preflight,
    preflightOption: options.preflightOption,
    verbose: options.verbose, // TODO: Remove it in the next major version up
    timeout: options.timeout,
    sandbox: options.sandbox,
    executableBrowser: options.executableBrowser,
    image: options.image,
    http: options.http,
    viewer: options.viewer,
    viewerParam: options.viewerParam,
    // browser: options.browser,
    proxyServer: options.proxyServer,
    proxyBypass: options.proxyBypass,
    proxyUser: options.proxyUser,
    proxyPass: options.proxyPass,
    logLevel: options.logLevel,
    ignoreHttpsErrors: options.ignoreHttpsErrors,
    bypassedPdfBuilderOption: options.bypassedPdfBuilderOption,
    executableChromium: options.executableChromium, // TODO: Remove it in the next major version up
  }).catch(gracefulError);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}

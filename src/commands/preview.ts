import { preview } from '../preview.js';
import { gracefulError } from '../util.js';
import { setupPreviewParserProgram } from './preview.parser.js';

try {
  const program = setupPreviewParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  preview({
    input: program.args?.[0],
    configPath: options.config,
    theme: options.theme,
    size: options.size,
    cropMarks: options.cropMarks,
    bleed: options.bleed,
    cropOffset: options.cropOffset,
    css: options.css,
    style: options.style,
    userStyle: options.userStyle,
    singleDoc: options.singleDoc,
    quick: options.quick,
    title: options.title,
    author: options.author,
    language: options.language,
    readingProgression: options.readingProgression,
    verbose: options.verbose, // TODO: Remove it in the next major version up
    timeout: options.timeout,
    sandbox: options.sandbox,
    executableBrowser: options.executableBrowser,
    http: options.http,
    viewer: options.viewer,
    viewerParam: options.viewerParam,
    browser: options.browser,
    proxyServer: options.proxyServer,
    proxyBypass: options.proxyBypass,
    proxyUser: options.proxyUser,
    proxyPass: options.proxyPass,
    logLevel: options.logLevel,
    ignoreHttpsErrors: options.ignoreHttpsErrors,
    executableChromium: options.executableChromium, // TODO: Remove it in the next major version up
  }).catch(gracefulError);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}

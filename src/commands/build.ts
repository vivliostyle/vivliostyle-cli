import process from 'process';
import { build } from '../build';
import { gracefulError } from '../util';
import { setupBuildParserProgram } from './build.parser';

try {
  const program = setupBuildParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  build({
    input: program.args?.[0],
    configPath: options.config,
    targets: options.targets,
    theme: options.theme,
    size: options.size,
    style: options.style,
    userStyle: options.userStyle,
    singleDoc: options.singleDoc,
    title: options.title,
    author: options.author,
    language: options.language,
    pressReady: options.pressReady,
    renderMode: options.renderMode || 'local',
    preflight: options.preflight,
    preflightOption: options.preflightOption,
    verbose: options.verbose,
    timeout: options.timeout,
    sandbox: options.sandbox,
    executableChromium: options.executableChromium,
    image: options.image,
    http: options.http,
    viewer: options.viewer,
    bypassedPdfBuilderOption: options.bypassedPdfBuilderOption,
  })
    .then(() => {
      process.exit(0);
    })
    .catch(gracefulError);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}

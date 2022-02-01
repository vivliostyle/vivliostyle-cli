import { preview } from '../preview';
import { gracefulError } from '../util';
import { setupPreviewParserProgram } from './preview.parser';

try {
  const program = setupPreviewParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  preview({
    input: program.args?.[0],
    configPath: options.config,
    theme: options.theme,
    size: options.size,
    style: options.style,
    userStyle: options.userStyle,
    singleDoc: options.singleDoc,
    quick: options.quick,
    title: options.title,
    author: options.author,
    language: options.language,
    verbose: options.verbose,
    timeout: options.timeout,
    sandbox: options.sandbox,
    executableChromium: options.executableChromium,
    http: options.http,
    viewer: options.viewer,
  }).catch(gracefulError);
} catch (err) {
  gracefulError(err);
}

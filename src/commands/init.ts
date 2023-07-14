import { init } from '../init.js';
import { gracefulError } from '../util.js';
import { setupInitParserProgram } from './init.parser.js';

try {
  const program = setupInitParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  init({
    title: options.title,
    author: options.author,
    language: options.language,
    size: options.size,
    theme: options.theme,
    logLevel: options.logLevel,
  }).catch(gracefulError);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}

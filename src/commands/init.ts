import { init } from '../init';
import { gracefulError } from '../util';
import { setupInitParserProgram } from './init.parser';

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
  }).catch(gracefulError);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}

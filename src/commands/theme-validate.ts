import process from 'node:process';

import { runThemeValidateCli } from './theme-validate.runner.js';

export { runThemeValidateCli } from './theme-validate.runner.js';

await runThemeValidateCli(process.argv);

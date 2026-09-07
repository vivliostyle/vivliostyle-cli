import process from 'node:process';

import { runThemeCreateCli } from './theme-create.runner.js';

export { runThemeCreateCli } from './theme-create.runner.js';

await runThemeCreateCli(process.argv);

import process from 'node:process';

import { runThemeCli } from './theme.runner.js';

export { runThemeCli } from './theme.runner.js';

await runThemeCli(process.argv);

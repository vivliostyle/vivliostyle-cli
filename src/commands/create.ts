import process from 'node:process';

import { runCreateCli } from './create.runner.js';

export { runCreateCli } from './create.runner.js';

await runCreateCli(process.argv);

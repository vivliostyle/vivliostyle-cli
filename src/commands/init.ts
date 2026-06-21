import process from 'node:process';

import { runInitCli } from './init.runner.js';

export { runInitCli } from './init.runner.js';

await runInitCli(process.argv);

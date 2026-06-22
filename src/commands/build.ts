import process from 'node:process';

import { runBuildCli } from './build.runner.js';

export { runBuildCli } from './build.runner.js';

await runBuildCli(process.argv);

import process from 'node:process';

import { runPreviewCli } from './preview.runner.js';

export { runPreviewCli } from './preview.runner.js';

await runPreviewCli(process.argv);

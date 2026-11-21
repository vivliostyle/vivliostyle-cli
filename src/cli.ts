#!/usr/bin/env node

import process from 'node:process';

import { createCommandDispatcher } from './commands/dispatch.js';
import { isDirectExecution } from './entry-util.js';

export const dispatchCli = createCommandDispatcher({
  commands: {
    create: {
      description: 'Scaffold a new Vivliostyle project',
      load: async () =>
        (await import('./commands/create.runner.js')).runCreateCli,
    },
    init: {
      description: 'Create a Vivliostyle configuration file',
      load: async () => (await import('./commands/init.runner.js')).runInitCli,
    },
    build: {
      description: 'Create PDF, EPUB, and other publication files',
      load: async () =>
        (await import('./commands/build.runner.js')).runBuildCli,
    },
    'build-worker': {
      description: 'Keep Chromium available for PDF builds',
      load: async () =>
        (await import('./commands/build-worker.runner.js')).runBuildWorkerCli,
    },
    'build-daemon': {
      description: 'Keep a publication build process running',
      load: async () => {
        const { runBuildDaemonCli } =
          await import('./commands/build-daemon.runner.js');
        return (argv) => runBuildDaemonCli(argv, import.meta.filename);
      },
    },
    preview: {
      description: 'Open the preview page and interactively save PDFs',
      load: async () =>
        (await import('./commands/preview.runner.js')).runPreviewCli,
    },
    theme: {
      description: 'Create and validate Vivliostyle theme packages',
      load: async () =>
        (await import('./commands/theme.runner.js')).runThemeCli,
    },
  },
});

if (isDirectExecution(import.meta.url)) {
  await dispatchCli(process.argv);
}

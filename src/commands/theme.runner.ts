import { createCommandDispatcher } from './dispatch.js';

export const runThemeCli = createCommandDispatcher({
  commandPath: ['theme'],
  description: 'Create and validate Vivliostyle theme packages',
  commands: {
    create: {
      description: 'Scaffold a new Vivliostyle theme package',
      load: async () =>
        (await import('./theme-create.runner.js')).runThemeCreateCli,
    },
    validate: {
      description: 'Validate a Vivliostyle theme package',
      load: async () =>
        (await import('./theme-validate.runner.js')).runThemeValidateCli,
    },
  },
});

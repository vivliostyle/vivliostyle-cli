import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { mockRequire } = await import('./index.js');

  const portfinderMod = {
    default: {
      getPortPromise: vi.fn(async () => {
        return 33333;
      }),
    },
  };

  await mockRequire('portfinder', portfinderMod);
  return { portfinder: portfinderMod };
});

vi.mock('portfinder', () => mocked.portfinder);

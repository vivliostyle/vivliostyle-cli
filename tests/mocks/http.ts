import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { mockRequire } = await import('./index.js');

  const { Agent } = await vi.importActual<typeof import('http')>('http');

  const httpMod = {
    default: {
      createServer: vi.fn(() => ({
        listen: (port: number, host: string, callback: () => void) => {
          callback();
        },
        close: () => {},
      })),
    },
    // `agentkeepalive` package requires this
    Agent,
  };

  await mockRequire('http', httpMod);
  return { http: httpMod };
});

vi.mock('http', () => mocked.http);
vi.mock('node:http', () => mocked.http);

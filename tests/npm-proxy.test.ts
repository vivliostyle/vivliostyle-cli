import { createServer, type Server } from 'node:http';

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { createFetch } from '../src/npm.js';

let target: Server;
let proxy: Server;
let targetUrl: string;
let proxyUrl: string;
let proxyRequests = 0;
let lastProxyAuthorization: string | undefined;

beforeAll(async () => {
  target = createServer((_request, response) => {
    response.end('direct');
  });
  proxy = createServer();
  proxy.on('connect', (request, socket) => {
    proxyRequests++;
    lastProxyAuthorization = request.headers['proxy-authorization'];
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  await Promise.all([
    new Promise<void>((resolve) => {
      target.listen(0, '127.0.0.1', resolve);
    }),
    new Promise<void>((resolve) => {
      proxy.listen(0, '127.0.0.1', resolve);
    }),
  ]);
  const targetAddress = target.address();
  const proxyAddress = proxy.address();
  if (
    !targetAddress ||
    typeof targetAddress === 'string' ||
    !proxyAddress ||
    typeof proxyAddress === 'string'
  ) {
    throw new Error('Missing server address');
  }
  targetUrl = `http://127.0.0.1:${targetAddress.port}/`;
  proxyUrl = `http://127.0.0.1:${proxyAddress.port}`;
});

afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  target.close();
  proxy.close();
});

it('uses lowercase no_proxy for npm fetches', async () => {
  vi.stubEnv('NOPROXY', '');
  delete process.env.NOPROXY;
  vi.stubEnv('NO_PROXY', '');
  delete process.env.NO_PROXY;
  vi.stubEnv('no_proxy', '127.0.0.1');
  const before = proxyRequests;
  const response = await createFetch({ proxyServer: proxyUrl })(targetUrl);
  expect(await response.text()).toBe('direct');
  expect(proxyRequests).toBe(before);
});

it('honors an empty override instead of falling back to no_proxy', async () => {
  vi.stubEnv('NOPROXY', '');
  delete process.env.NOPROXY;
  vi.stubEnv('NO_PROXY', '');
  delete process.env.NO_PROXY;
  vi.stubEnv('no_proxy', '127.0.0.1');
  const before = proxyRequests;
  await expect(
    createFetch({ proxyServer: proxyUrl, proxyBypass: '' })(targetUrl),
  ).rejects.toThrow('fetch failed');
  expect(proxyRequests).toBeGreaterThan(before);
});

it('prefers NOPROXY over NO_PROXY for npm fetches', async () => {
  vi.stubEnv('NOPROXY', '127.0.0.1');
  vi.stubEnv('NO_PROXY', 'other.example');
  vi.stubEnv('no_proxy', 'other.example');
  const before = proxyRequests;
  const response = await createFetch({ proxyServer: proxyUrl })(targetUrl);
  expect(await response.text()).toBe('direct');
  expect(proxyRequests).toBe(before);
});

it('sends proxy credentials to the proxy server', async () => {
  vi.stubEnv('NOPROXY', '');
  const before = proxyRequests;
  await expect(
    createFetch({
      proxyServer: proxyUrl,
      proxyUser: 'user',
      proxyPass: 'pass',
    })(targetUrl),
  ).rejects.toThrow('fetch failed');
  expect(proxyRequests).toBeGreaterThan(before);
  expect(lastProxyAuthorization).toBe(
    `Basic ${Buffer.from('user:pass').toString('base64')}`,
  );
});

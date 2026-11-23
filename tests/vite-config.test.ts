import os from 'node:os';

import { defaultAllowedOrigins } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  getRemoteViewerOrigin,
  resolveViteConfig,
} from '../src/config/vite.js';

const resolve = (
  viewer: string | undefined,
  viteConfig?: import('vite').UserConfig,
) =>
  resolveViteConfig({
    serverRootDir: os.tmpdir(),
    workspaceDir: os.tmpdir(),
    server: { host: false, port: 13000, proxy: {}, allowedHosts: [] },
    viteConfig,
    viteConfigFile: false,
    logLevel: 'silent',
    viewer,
    mode: 'build',
  });

describe('getRemoteViewerOrigin', () => {
  it.each([
    ['https://vivliostyle.org/viewer/', 'https://vivliostyle.org'],
    ['https://vivliostyle.vercel.app/#src=x', 'https://vivliostyle.vercel.app'],
    ['http://192.168.0.2:8000/', 'http://192.168.0.2:8000'],
  ])('returns the origin of %s', (viewer, origin) => {
    expect(getRemoteViewerOrigin(viewer)).toBe(origin);
  });

  it.each([
    undefined,
    'http://localhost:8000/',
    'http://127.0.0.1:8000/',
    'file:///path/to/viewer/index.html',
    'not a url',
  ])('returns undefined for %s', (viewer) => {
    expect(getRemoteViewerOrigin(viewer)).toBeUndefined();
  });
});

describe('resolveViteConfig CORS for a remote viewer', () => {
  it('allows the remote viewer origin in addition to the defaults', async () => {
    const config = await resolve('https://vivliostyle.org/viewer/');
    const expected = {
      origin: [defaultAllowedOrigins, 'https://vivliostyle.org'],
    };
    expect(config.server.cors).toEqual(expected);
    expect(config.preview.cors).toEqual(expected);
  });

  it('keeps the Vite default without a remote viewer', async () => {
    for (const viewer of [undefined, 'http://localhost:8000/']) {
      const config = await resolve(viewer);
      expect(config.server.cors).toEqual({ origin: defaultAllowedOrigins });
      expect(config.preview.cors).toEqual({ origin: defaultAllowedOrigins });
    }
  });

  it('respects a user-configured cors option', async () => {
    const config = await resolve('https://vivliostyle.org/viewer/', {
      server: { cors: false },
    });
    expect(config.server.cors).toBe(false);
    expect(config.preview.cors).toBe(false);

    const previewOnly = await resolve('https://vivliostyle.org/viewer/', {
      preview: { cors: true },
    });
    expect(previewOnly.preview.cors).toBe(true);
  });
});

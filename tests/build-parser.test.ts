import { describe, expect, it } from 'vitest';

import { parseBuildCommand } from '../src/commands/build.parser.js';

describe('build command parser', () => {
  it('accepts a positional input starting with a hyphen after --', () => {
    const options = parseBuildCommand([
      'vivliostyle',
      'build',
      '--',
      '-input.md',
    ]);

    expect(options.input).toEqual({
      format: 'markdown',
      entry: '-input.md',
    });
  });

  it('accepts a Chromium DevTools HTTP URL', () => {
    const options = parseBuildCommand([
      'vivliostyle',
      'build',
      '--browser-url',
      'http://127.0.0.1:9222',
      'input.md',
    ]);

    expect(options.browserUrl).toBe('http://127.0.0.1:9222');
  });

  it('rejects a WebSocket URL for --browser-url', () => {
    expect(() =>
      parseBuildCommand([
        'vivliostyle',
        'build',
        '--browser-url',
        'ws://127.0.0.1:9222/devtools/browser/id',
        'input.md',
      ]),
    ).toThrow('requires a Chromium DevTools HTTP(S) URL');
  });
});

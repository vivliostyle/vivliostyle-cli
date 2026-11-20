import { describe, expect, it } from 'vitest';

import {
  parseBuildCli,
  parseBuildCommand,
} from '../src/commands/build.parser.js';

describe('build command parser', () => {
  it('keeps the browser worker option out of inline configuration', () => {
    const parsed = parseBuildCli([
      'vivliostyle',
      'build',
      '--browser-worker',
      '/tmp/vs/build.sock',
      'document.md',
    ]);
    expect(parsed.browserWorker).toBe('/tmp/vs/build.sock');
    expect(parsed.inlineConfig).not.toHaveProperty('browserWorker');
  });

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
});

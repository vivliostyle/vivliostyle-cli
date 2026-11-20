import { describe, expect, it } from 'vitest';

import { parseBuildOptions } from '../src/commands/build.parser.js';
import { parseInlineFlags } from '../src/commands/cli-flags.js';

describe('build command parser', () => {
  it('keeps the browser worker option out of inline configuration', () => {
    const parsed = parseBuildOptions([
      'vivliostyle',
      'build',
      '--browser-worker',
      '/tmp/vs/build.sock',
      'document.md',
    ]);
    expect(parsed.browserWorker).toBe('/tmp/vs/build.sock');
    expect(parsed.options).not.toHaveProperty('browserWorker');
  });

  it('accepts a positional input starting with a hyphen after --', () => {
    const { options } = parseBuildOptions([
      'vivliostyle',
      'build',
      '--',
      '-input.md',
    ]);

    expect(parseInlineFlags(options).input).toEqual({
      format: 'markdown',
      entry: '-input.md',
    });
  });
});

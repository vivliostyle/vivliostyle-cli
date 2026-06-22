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
});

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  builtinCmykConversion,
  builtinGrayConversion,
  iccConversion,
} from '../src/image-replacement.js';
import type { CMYKValue } from '../src/index.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');

function expectCmykValue(value: CMYKValue | null): CMYKValue {
  if (value === null) {
    throw new Error('Expected a CMYK value');
  }
  return value;
}

describe('builtinCmykConversion', () => {
  it('converts black to mostly K', async () => {
    const convert = builtinCmykConversion();

    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero CMYK', async () => {
    const convert = builtinCmykConversion();

    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );

    expect(result.c).toBeLessThan(500);
    expect(result.m).toBeLessThan(500);
    expect(result.y).toBeLessThan(500);
    expect(result.k).toBeLessThan(500);
  });
});

describe('builtinGrayConversion', () => {
  it('converts black to high K', async () => {
    const convert = builtinGrayConversion();

    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero K', async () => {
    const convert = builtinGrayConversion();

    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );

    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeLessThan(500);
  });
});

describe('iccConversion', () => {
  it('converts colors through a CMYK profile', async () => {
    const profile = fs.readFileSync(path.join(fixturesDir, 'ps_cmyk.icc'));
    const convert = iccConversion(profile);

    const black = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));
    const white = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );

    expect(black.c + black.m + black.y + black.k).toBeGreaterThan(10000);
    expect(white.c).toBeLessThan(500);
    expect(white.m).toBeLessThan(500);
    expect(white.y).toBeLessThan(500);
    expect(white.k).toBeLessThan(500);
  });

  it('maps grayscale profiles to the K channel', async () => {
    const profile = fs.readFileSync(path.join(fixturesDir, 'ps_gray.icc'));
    const convert = iccConversion(profile);

    const black = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(black).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(black.k).toBeGreaterThan(5000);
  });

  it('destroys the native profile buffer after conversion', async () => {
    const mupdf = await import('mupdf');
    const destroy = vi.spyOn(mupdf.Buffer.prototype, 'destroy');
    const profile = fs.readFileSync(path.join(fixturesDir, 'ps_cmyk.icc'));
    const convert = iccConversion(profile);

    try {
      await convert({ r: 1000, g: 2000, b: 3000 });

      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      destroy.mockRestore();
    }
  });
});

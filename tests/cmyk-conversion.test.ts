import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { disposable } from '../src/disposable.js';
import {
  type ColorConversionOptions,
  createBuiltinCmykConversion,
  createBuiltinGrayConversion,
  createIccConversion,
  createCmykConversionFunction,
} from '../src/image-replacement.js';
import type { CMYKValue } from '../src/index.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
let temporaryDir: string;
let inputProfile: string;

beforeAll(async () => {
  const temporaryRoot = path.join(import.meta.dirname, '..', '.tmp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  temporaryDir = fs.mkdtempSync(path.join(temporaryRoot, 'cmyk-conversion-'));
  inputProfile = path.join(temporaryDir, 'swapped-primaries.icc');
  const mupdf = await import('mupdf');
  using doc = disposable(
    mupdf.PDFDocument.openDocument(
      fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
      'application/pdf',
    ) as import('mupdf').PDFDocument,
  );
  using page = disposable(doc.loadPage(0));
  using profile = disposable(
    page
      .getObject()
      .get('Resources')
      .get('XObject')
      .get('X4')
      .get('ColorSpace')
      .get(1)
      .readStream(),
  );
  const bytes = Buffer.from(profile.asUint8Array());
  const redTag = bytes.indexOf('rXYZ');
  const blueTag = bytes.indexOf('bXYZ');
  const redOffset = bytes.readUInt32BE(redTag + 4);
  const blueOffset = bytes.readUInt32BE(blueTag + 4);
  const tagLength = bytes.readUInt32BE(redTag + 8);
  const redPrimary = Buffer.from(
    bytes.subarray(redOffset, redOffset + tagLength),
  );
  bytes.copy(bytes, redOffset, blueOffset, blueOffset + tagLength);
  redPrimary.copy(bytes, blueOffset);
  fs.writeFileSync(inputProfile, bytes);
});

afterAll(() => {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
});

function expectCmykValue(value: CMYKValue | null): CMYKValue {
  if (value === null) {
    throw new Error('Expected a CMYK value');
  }
  return value;
}

describe('createBuiltinCmykConversion', () => {
  it('converts black to mostly K', async () => {
    const convert = createCmykConversionFunction(createBuiltinCmykConversion());

    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero CMYK', async () => {
    const convert = createCmykConversionFunction(createBuiltinCmykConversion());

    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );

    expect(result.c).toBeLessThan(500);
    expect(result.m).toBeLessThan(500);
    expect(result.y).toBeLessThan(500);
    expect(result.k).toBeLessThan(500);
  });
});

describe('createBuiltinGrayConversion', () => {
  it('converts black to high K', async () => {
    const convert = createCmykConversionFunction(createBuiltinGrayConversion());

    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero K', async () => {
    const convert = createCmykConversionFunction(createBuiltinGrayConversion());

    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );

    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeLessThan(500);
  });
});

describe('createIccConversion', () => {
  it('converts colors through a CMYK profile', async () => {
    const convert = createCmykConversionFunction(
      createIccConversion({
        outputProfile: path.join(fixturesDir, 'ps_cmyk.icc'),
      }),
    );

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
    const convert = createCmykConversionFunction(
      createIccConversion({
        outputProfile: path.join(fixturesDir, 'ps_gray.icc'),
      }),
    );

    const black = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));

    expect(black).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(black.k).toBeGreaterThan(5000);
  });

  it('destroys the native profile buffer after conversion', async () => {
    const mupdf = await import('mupdf');
    const destroy = vi.spyOn(mupdf.Buffer.prototype, 'destroy');
    const convert = createCmykConversionFunction(
      createIccConversion({
        outputProfile: path.join(fixturesDir, 'ps_cmyk.icc'),
      }),
    );

    try {
      await convert({ r: 1000, g: 2000, b: 3000 });
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      destroy.mockRestore();
    }
  });

  it('rejects an RGB output profile', async () => {
    const convert = createCmykConversionFunction(
      createIccConversion({
        outputProfile: inputProfile,
      }),
    );

    await expect(convert({ r: 1000, g: 2000, b: 3000 })).rejects.toThrow(
      'Cannot derive CMYK values from a [ColorSpace DeviceRGB] image',
    );
  });

  it('rejects invalid ICC profile data', async () => {
    const outputProfile = path.join(temporaryDir, 'invalid.icc');
    fs.writeFileSync(outputProfile, 'invalid ICC profile');
    const convert = createCmykConversionFunction(
      createIccConversion({
        outputProfile,
      }),
    );

    await expect(convert({ r: 1000, g: 2000, b: 3000 })).rejects.toThrow(
      'cmsOpenProfileFromMem failed',
    );
  });
});

describe.each([
  {
    name: 'DeviceCMYK',
    create: createBuiltinCmykConversion,
    outputProfiles: [],
  },
  {
    name: 'DeviceGray',
    create: createBuiltinGrayConversion,
    outputProfiles: [],
  },
  {
    name: 'ICC',
    outputProfiles: [path.join(fixturesDir, 'ps_cmyk.icc')],
    create: (options: ColorConversionOptions) =>
      createIccConversion({
        ...options,
        outputProfile: path.join(fixturesDir, 'ps_cmyk.icc'),
      }),
  },
])('$name input profiles', ({ create, outputProfiles }) => {
  it('interprets RGB using the input profile and reads each profile once', async () => {
    const rgb = { r: 8000, g: 4000, b: 2000 };
    const unprofiled = await createCmykConversionFunction(create({}))(rgb);
    const readFile = vi.spyOn(fs, 'readFileSync');
    const conversion = create({ inputProfile });
    const profilePaths = [inputProfile, ...outputProfiles];

    try {
      expect(readFile).not.toHaveBeenCalled();
      const convert = createCmykConversionFunction(conversion);
      const profiled = expectCmykValue(await convert(rgb));
      expect(profiled).not.toEqual(unprofiled);
      expect(await convert(rgb)).toEqual(profiled);
      expect(
        readFile.mock.calls.filter(([filename]) =>
          profilePaths.includes(String(filename)),
        ),
      ).toEqual(profilePaths.map((filename) => [filename]));
    } finally {
      readFile.mockRestore();
    }
  });

  it('rejects a non-RGB input profile and disposes native buffers', async () => {
    const mupdf = await import('mupdf');
    const conversion = create({
      inputProfile: path.join(fixturesDir, 'ps_gray.icc'),
    });
    const convert = createCmykConversionFunction(conversion);
    const destroy = vi.spyOn(mupdf.Buffer.prototype, 'destroy');

    try {
      await expect(convert({ r: 1000, g: 2000, b: 3000 })).rejects.toThrow(
        'inputProfile uses Gray, but the input image uses DeviceRGB',
      );
      expect(destroy).toHaveBeenCalledTimes(outputProfiles.length + 1);
    } finally {
      destroy.mockRestore();
    }
  });
});

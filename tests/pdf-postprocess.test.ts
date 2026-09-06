import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { CmykConfig } from '../src/config/resolve.js';
import { Logger } from '../src/logger.js';
import { PostProcess } from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
const temporaryDir = path.join(import.meta.dirname, '..', '.tmp');

function cmykConfig(overrides: Partial<CmykConfig> = {}): CmykConfig {
  return {
    ifUnmappedColorsFound: 'warn',
    ifIncompatibleImagesFound: 'warn',
    overrideMap: [],
    reserveMap: [],
    mapOutput: undefined,
    ...overrides,
  };
}

async function runSave(
  pdf: Uint8Array,
  cmyk: CmykConfig | false,
): Promise<{ error: Error | null; written: boolean; warnings: string[] }> {
  fs.mkdirSync(temporaryDir, { recursive: true });
  const output = path.join(temporaryDir, `cmyk-check-${randomUUID()}.pdf`);
  const warning = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  let error: Error | null = null;

  try {
    const postProcess = await PostProcess.load(pdf);
    await postProcess.save(output, {
      preflight: undefined,
      preflightOption: [],
      image: '',
      cmyk,
      cmykMap: {},
      replaceImage: [],
    });
  } catch (cause) {
    error = cause instanceof Error ? cause : new Error(String(cause));
  }

  const warnings = warning.mock.calls.flat().map(String);
  warning.mockRestore();
  const written = fs.existsSync(output);
  fs.rmSync(output, { force: true });
  return { error, written, warnings };
}

it('warns about unmapped colors and incompatible images by default', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const result = await runSave(pdf, cmykConfig());

  expect(result.error).toBeNull();
  expect(result.written).toBe(true);
  expect(result.warnings).toContainEqual(
    expect.stringContaining('RGB color not mapped to CMYK'),
  );
  expect(result.warnings).toContainEqual(
    expect.stringContaining('incompatible with Device CMYK'),
  );
});

it('fails before writing when an incompatible image is found', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const result = await runSave(
    pdf,
    cmykConfig({ ifIncompatibleImagesFound: 'error' }),
  );

  expect(result.error?.message).toContain(
    'image(s) incompatible with Device CMYK color',
  );
  expect(result.written).toBe(false);
});

it('fails before writing when an unmapped color is found', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

  const result = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'ignore',
    }),
  );

  expect(result.error?.message).toContain('RGB color(s) not mapped to CMYK');
  expect(result.written).toBe(false);
  expect(result.warnings).toContainEqual(
    expect.stringContaining('RGB color not mapped to CMYK'),
  );
});

it('combines color and image failures', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const result = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'error',
    }),
  );

  expect(result.error?.message).toMatch(
    /RGB color\(s\) not mapped to CMYK; .*image\(s\) incompatible with Device CMYK/v,
  );
  expect(result.written).toBe(false);
});

it('skips both checks when configured to ignore them', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const result = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'ignore',
      ifIncompatibleImagesFound: 'ignore',
    }),
  );

  expect(result.error).toBeNull();
  expect(result.written).toBe(true);
  expect(result.warnings).toEqual([]);
});

it('writes the color map before reporting unmapped color errors', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));
  fs.mkdirSync(temporaryDir, { recursive: true });
  const mapOutput = path.join(temporaryDir, `cmyk-map-${randomUUID()}.json`);

  try {
    const result = await runSave(
      pdf,
      cmykConfig({
        ifUnmappedColorsFound: 'error',
        ifIncompatibleImagesFound: 'ignore',
        overrideMap: [
          [
            { r: 10000, g: 0, b: 0 },
            { c: 0, m: 10000, y: 10000, k: 0 },
          ],
        ],
        mapOutput,
      }),
    );

    expect(result.error?.message).toContain('RGB color(s) not mapped to CMYK');
    expect(JSON.parse(fs.readFileSync(mapOutput, 'utf8'))).toEqual({
      '[10000,0,0]': { c: 0, m: 10000, y: 10000, k: 0 },
    });
  } finally {
    fs.rmSync(mapOutput, { force: true });
  }
});

it('skips image compatibility checks when CMYK processing is disabled', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const result = await runSave(pdf, false);

  expect(result.error).toBeNull();
  expect(result.written).toBe(true);
  expect(result.warnings).toEqual([]);
});

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { CmykConfig } from '../src/config/resolve.js';
import { Logger } from '../src/logger.js';
import { PostProcess } from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');

function createPostProcess(pdf: Uint8Array): PostProcess {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- construct a PostProcess around a stub document without going through pdf-lib
  return Object.assign(Object.create(PostProcess.prototype), {
    document: { save: () => Promise.resolve(pdf) },
  }) as PostProcess;
}

function cmykConfig(overrides: Partial<CmykConfig> = {}): CmykConfig {
  return {
    ifUnmappedColorsFound: 'warn',
    ifUnreplacedImagesFound: 'warn',
    overrideMap: [],
    reserveMap: [],
    mapOutput: undefined,
    ...overrides,
  };
}

async function runSave(
  pdf: Uint8Array,
  cmyk: CmykConfig,
): Promise<{ thrown: string | null; written: boolean; warns: string[] }> {
  const outputPath = path.join(
    os.tmpdir(),
    `vivliostyle-cli-test-${randomUUID()}.pdf`,
  );
  const spy = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  let thrown: string | null = null;
  try {
    await createPostProcess(pdf).save(outputPath, {
      preflight: undefined,
      preflightOption: [],
      image: '',
      cmyk,
      cmykMap: {},
      replaceImage: [],
    });
  } catch (error) {
    thrown = String(error);
  }
  const warns = spy.mock.calls.flat().map(String);
  spy.mockRestore();
  const written = fs.existsSync(outputPath);
  fs.rmSync(outputPath, { force: true });
  return { thrown, written, warns };
}

it('warns about unmapped colors and unreplaced images by default', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const { thrown, written, warns } = await runSave(pdf, cmykConfig());

  expect(thrown).toBeNull();
  expect(written).toBe(true);
  expect(warns).toContainEqual(
    expect.stringContaining('RGB color not mapped to CMYK'),
  );
  expect(warns).toContainEqual(
    expect.stringContaining('Non-CMYK image remaining in PDF: ref'),
  );
});

it('fails the build without writing output when ifUnreplacedImagesFound is error', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const { thrown, written } = await runSave(
    pdf,
    cmykConfig({ ifUnreplacedImagesFound: 'error' }),
  );

  expect(thrown).toContain('non-CMYK image(s) remaining in the PDF');
  expect(written).toBe(false);
});

it('fails the build without writing output when ifUnmappedColorsFound is error', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

  const { thrown, written, warns } = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'error',
      ifUnreplacedImagesFound: 'ignore',
    }),
  );

  expect(thrown).toContain('RGB color(s) not mapped to CMYK');
  expect(written).toBe(false);
  expect(warns).toContainEqual(
    expect.stringContaining('RGB color not mapped to CMYK'),
  );
});

it('combines failures from both categories into a single error', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const { thrown, written } = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'error',
      ifUnreplacedImagesFound: 'error',
    }),
  );

  expect(thrown).toMatch(
    /RGB color\(s\) not mapped to CMYK; .*non-CMYK image\(s\) remaining/v,
  );
  expect(written).toBe(false);
});

it('skips all checks when both options are ignore', async () => {
  const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

  const { thrown, written, warns } = await runSave(
    pdf,
    cmykConfig({
      ifUnmappedColorsFound: 'ignore',
      ifUnreplacedImagesFound: 'ignore',
    }),
  );

  expect(thrown).toBeNull();
  expect(written).toBe(true);
  expect(warns).toEqual([]);
});

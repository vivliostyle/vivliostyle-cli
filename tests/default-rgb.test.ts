import fs from 'node:fs';
import path from 'node:path';

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib';
import { assert, beforeEach, expect, it, onTestFinished } from 'vitest';

import {
  postProcessPDF,
  type SaveOption,
} from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
let temporaryDir: string;
let rgbProfile: string;

beforeEach(async () => {
  const root = path.join(import.meta.dirname, '..', '.tmp');
  fs.mkdirSync(root, { recursive: true });
  temporaryDir = fs.mkdtempSync(path.join(root, 'default-rgb-'));
  onTestFinished(() =>
    fs.rmSync(temporaryDir, { recursive: true, force: true }),
  );
  const original = await PDFDocument.load(
    fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
  );
  const profile = pdfStreams(original)
    .map(([, object]) => object)
    .find((object) => object.dict.get(PDFName.of('N'))?.toString() === '3');
  assert(profile instanceof PDFRawStream);
  rgbProfile = path.join(temporaryDir, 'rgb.icc');
  fs.writeFileSync(
    rgbProfile,
    Buffer.from(decodePDFRawStream(profile).decode()),
  );
});

async function savePdf(
  options: Partial<SaveOption> = {},
  input = fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
): Promise<PDFDocument> {
  const output = path.join(temporaryDir, 'output.pdf');
  await postProcessPDF({
    pdf: input,
    output,
    preflight: undefined,
    preflightOption: [],
    image: 'vivliostyle/cli',
    cmyk: false,
    cmykMap: {},
    replaceImage: [],
    ...options,
  });
  return PDFDocument.load(fs.readFileSync(output), { updateMetadata: false });
}

function pdfStreams(document: PDFDocument): [PDFRef, PDFRawStream][] {
  return document.context
    .enumerateIndirectObjects()
    .filter(
      (entry): entry is [PDFRef, PDFRawStream] =>
        entry[1] instanceof PDFRawStream,
    );
}

function defaultRgb(document: PDFDocument, resources: PDFDict): PDFRawStream {
  const colorSpace = resources
    .lookup(PDFName.of('ColorSpace'), PDFDict)
    .lookup(PDFName.of('DefaultRGB'), PDFArray);
  expect(colorSpace.get(0)?.toString()).toBe('/ICCBased');
  const profile = document.context.lookup(colorSpace.get(1));
  assert(profile instanceof PDFRawStream);
  return profile;
}

it('declares DefaultRGB on page resources without changing existing streams', async () => {
  const input = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
  const original = await PDFDocument.load(input, { updateMetadata: false });

  const document = await savePdf({ defaultRgbProfile: rgbProfile }, input);

  const profile = defaultRgb(document, document.getPage(0).node.Resources()!);
  expect(profile.dict.get(PDFName.of('N'))?.toString()).toBe('3');
  expect(profile.dict.get(PDFName.of('Alternate'))?.toString()).toBe(
    '/DeviceRGB',
  );
  expect(Buffer.from(decodePDFRawStream(profile).decode())).toEqual(
    fs.readFileSync(rgbProfile),
  );
  for (const [ref, object] of pdfStreams(original)) {
    const saved = document.context.lookup(ref);
    assert(saved instanceof PDFRawStream);
    expect(saved.dict.toString()).toBe(object.dict.toString());
    expect(saved.contents).toEqual(object.contents);
  }
});

it('declares DefaultRGB on form XObjects, tiling patterns and Type 3 fonts and keeps existing declarations', async () => {
  const input = await PDFDocument.create();
  const form = input.context.register(
    input.context.stream('1 0 0 rg 0 0 10 10 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { ColorSpace: { CS0: 'DeviceGray' } },
    }),
  );
  const pattern = input.context.register(
    input.context.stream('0 1 0 rg 0 0 5 5 re f', {
      PatternType: 1,
      PaintType: 1,
      TilingType: 1,
      BBox: [0, 0, 10, 10],
      XStep: 10,
      YStep: 10,
      Resources: {},
    }),
  );
  const font = input.context.register(
    input.context.obj({
      Type: 'Font',
      Subtype: 'Type3',
      FontBBox: [0, 0, 10, 10],
      FontMatrix: [0.1, 0, 0, 0.1, 0, 0],
      CharProcs: {},
      Encoding: { Type: 'Encoding', Differences: [] },
      FirstChar: 0,
      LastChar: 0,
      Widths: [0],
      Resources: {},
    }),
  );
  const first = input.addPage([100, 100]);
  first.node.set(
    PDFName.of('Resources'),
    input.context.obj({
      XObject: { Fm1: form },
      Pattern: { P1: pattern },
      Font: { T1: font },
    }),
  );
  const second = input.addPage([100, 100]);
  second.node.set(
    PDFName.of('Resources'),
    input.context.obj({ ColorSpace: { DefaultRGB: 'DeviceRGB' } }),
  );

  const document = await savePdf(
    { defaultRgbProfile: rgbProfile },
    Buffer.from(await input.save()),
  );

  const pageProfile = defaultRgb(
    document,
    document.getPage(0).node.Resources()!,
  );
  const savedForm = document.context.lookup(form);
  const savedPattern = document.context.lookup(pattern);
  assert(savedForm instanceof PDFRawStream);
  assert(savedPattern instanceof PDFRawStream);
  const formProfile = defaultRgb(
    document,
    savedForm.dict.lookup(PDFName.of('Resources'), PDFDict),
  );
  const patternProfile = defaultRgb(
    document,
    savedPattern.dict.lookup(PDFName.of('Resources'), PDFDict),
  );
  const fontProfile = defaultRgb(
    document,
    document.context
      .lookup(font, PDFDict)
      .lookup(PDFName.of('Resources'), PDFDict),
  );
  expect(formProfile).toBe(pageProfile);
  expect(patternProfile).toBe(pageProfile);
  expect(fontProfile).toBe(pageProfile);
  expect(
    savedForm.dict
      .lookup(PDFName.of('Resources'), PDFDict)
      .lookup(PDFName.of('ColorSpace'), PDFDict)
      .get(PDFName.of('CS0'))
      ?.toString(),
  ).toBe('/DeviceGray');
  expect(
    document
      .getPage(1)
      .node.Resources()!
      .lookup(PDFName.of('ColorSpace'), PDFDict)
      .get(PDFName.of('DefaultRGB'))
      ?.toString(),
  ).toBe('/DeviceRGB');
});

it('raises the PDF version required by ICC-based color spaces', async () => {
  const input = Buffer.from(
    fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
  );
  input.write('%PDF-1.2', 0, 'ascii');

  await savePdf({ defaultRgbProfile: rgbProfile }, input);

  const output = fs.readFileSync(path.join(temporaryDir, 'output.pdf'));
  expect(output.subarray(0, 8).toString('ascii')).toBe('%PDF-1.3');
});

it('leaves resources untouched when the option is omitted', async () => {
  const document = await savePdf();

  expect(
    document.getPage(0).node.Resources()?.has(PDFName.of('ColorSpace')),
  ).toBe(false);
});

it.each([
  ['ps_cmyk.icc', 'CMYK'],
  ['ps_gray.icc', 'Gray'],
])('rejects %s, which uses the %s color space', async (filename, type) => {
  await expect(
    savePdf({ defaultRgbProfile: path.join(fixturesDir, filename) }),
  ).rejects.toThrow(`${filename} uses ${type}`);

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

it('fails without writing output when the profile cannot be read', async () => {
  await expect(
    savePdf({ defaultRgbProfile: path.join(temporaryDir, 'missing.icc') }),
  ).rejects.toThrow('missing.icc');

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

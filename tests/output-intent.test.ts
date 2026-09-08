import fs from 'node:fs';
import path from 'node:path';

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFString,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib';
import { assert, beforeEach, expect, it, onTestFinished, vi } from 'vitest';

import { Logger } from '../src/logger.js';
import {
  postProcessPDF,
  type SaveOption,
} from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
let temporaryDir: string;

beforeEach(() => {
  const root = path.join(import.meta.dirname, '..', '.tmp');
  fs.mkdirSync(root, { recursive: true });
  temporaryDir = fs.mkdtempSync(path.join(root, 'output-intent-'));
  onTestFinished(() =>
    fs.rmSync(temporaryDir, { recursive: true, force: true }),
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

function outputIntent(document: PDFDocument): PDFDict {
  const intents = document.catalog.lookup(
    PDFName.of('OutputIntents'),
    PDFArray,
  );
  expect(intents.size()).toBe(1);
  return intents.lookup(0, PDFDict);
}

function pdfStreams(document: PDFDocument): [PDFRef, PDFRawStream][] {
  return document.context
    .enumerateIndirectObjects()
    .filter(
      (entry): entry is [PDFRef, PDFRawStream] =>
        entry[1] instanceof PDFRawStream,
    );
}

it.each([
  ['ps_cmyk.icc', 4],
  ['ps_gray.icc', 1],
] as const)(
  'embeds %s without changing existing PDF streams',
  async (filename, components) => {
    const input = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const original = await PDFDocument.load(input, { updateMetadata: false });
    const warning = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
    onTestFinished(() => warning.mockRestore());

    const document = await savePdf(
      {
        outputIntent: path.join(fixturesDir, filename),
      },
      input,
    );

    const intent = outputIntent(document);
    expect(intent.get(PDFName.of('Type'))?.toString()).toBe('/OutputIntent');
    expect(intent.get(PDFName.of('S'))?.toString()).toBe('/GTS_PDFX');
    expect(
      intent
        .lookup(PDFName.of('OutputConditionIdentifier'), PDFString)
        .decodeText(),
    ).toBe('Custom');
    expect(intent.lookup(PDFName.of('Info'), PDFString).decodeText()).toBe(
      filename,
    );
    const profile = intent.lookup(PDFName.of('DestOutputProfile'));
    assert(profile instanceof PDFRawStream);
    expect(profile.dict.get(PDFName.of('N'))?.toString()).toBe(
      String(components),
    );
    expect(Buffer.from(decodePDFRawStream(profile).decode())).toEqual(
      fs.readFileSync(path.join(fixturesDir, filename)),
    );
    for (const [ref, object] of pdfStreams(original)) {
      const saved = document.context.lookup(ref);
      assert(saved instanceof PDFRawStream);
      expect(saved.dict.toString()).toBe(object.dict.toString());
      expect(saved.contents).toEqual(object.contents);
    }
    expect(document.getPageCount()).toBe(original.getPageCount());
    expect(document.getTitle()).toBe(original.getTitle());
    expect(warning).not.toHaveBeenCalled();
  },
);

it('leaves output intents absent when the option is omitted', async () => {
  const document = await savePdf();

  expect(document.catalog.has(PDFName.of('OutputIntents'))).toBe(false);
});

it('embeds an RGB profile extracted from an existing PDF', async () => {
  const original = await PDFDocument.load(
    fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
  );
  const profile = pdfStreams(original)
    .map(([, object]) => object)
    .find((object) => object.dict.get(PDFName.of('N'))?.toString() === '3');
  assert(profile instanceof PDFRawStream);
  const profileData = Buffer.from(decodePDFRawStream(profile).decode());
  const profilePath = path.join(temporaryDir, 'rgb.icc');
  fs.writeFileSync(profilePath, profileData);

  const document = await savePdf({ outputIntent: profilePath });
  const embedded = outputIntent(document).lookup(
    PDFName.of('DestOutputProfile'),
  );

  assert(embedded instanceof PDFRawStream);
  expect(embedded.dict.get(PDFName.of('N'))?.toString()).toBe('3');
  expect(Buffer.from(decodePDFRawStream(embedded).decode())).toEqual(
    profileData,
  );
});

it('preserves an existing intent when omitted and replaces it when specified', async () => {
  const initial = await savePdf({
    outputIntent: path.join(fixturesDir, 'ps_gray.icc'),
  });
  const input = Buffer.from(await initial.save());
  const unchanged = await savePdf({}, input);
  const replaced = await savePdf(
    {
      outputIntent: path.join(fixturesDir, 'ps_cmyk.icc'),
    },
    input,
  );

  expect(
    outputIntent(unchanged).lookup(PDFName.of('Info'), PDFString).decodeText(),
  ).toBe('ps_gray.icc');
  expect(
    outputIntent(replaced).lookup(PDFName.of('Info'), PDFString).decodeText(),
  ).toBe('ps_cmyk.icc');
});

it('fails without writing output when the profile cannot be read', async () => {
  await expect(
    savePdf({
      outputIntent: path.join(temporaryDir, 'missing.icc'),
    }),
  ).rejects.toThrow('missing.icc');

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

it('propagates a profile loading failure', async () => {
  await expect(
    savePdf({
      outputIntent: path.join(fixturesDir, 'image.pdf'),
    }),
  ).rejects.toThrow(Error);

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

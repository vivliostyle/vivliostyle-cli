import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  rgb,
} from 'pdf-lib';
import { assert, expect, it, onTestFinished } from 'vitest';

import type { Meta } from '../src/global-viewer.js';
import { postProcessPDF } from '../src/output/pdf-postprocess.js';

const temporaryDir = path.join(import.meta.dirname, '..', '.tmp');

function text(dictionary: PDFDict, key: string): string {
  const value = dictionary.lookup(PDFName.of(key));
  assert(value instanceof PDFString || value instanceof PDFHexString);
  return value.decodeText();
}

it('applies document metadata, outlines, page boxes, and trailing-page removal', async () => {
  fs.mkdirSync(temporaryDir, { recursive: true });
  const output = path.join(temporaryDir, `pdf-document-${randomUUID()}.pdf`);
  onTestFinished(() => fs.rmSync(output, { force: true }));

  const input = await PDFDocument.create();
  input.addPage([600, 900]);
  input.addPage([600, 900]);
  await postProcessPDF({
    pdf: await input.save(),
    output,
    metadata: {
      'http://purl.org/dc/terms/title': [{ v: '試験文書', o: 0 }],
      'http://purl.org/dc/terms/creator': [
        { v: 'Alice', o: 0 },
        { v: 'Bob', o: 1 },
      ],
      'http://purl.org/dc/terms/description': [{ v: '概要', o: 0 }],
      'http://purl.org/dc/terms/subject': [
        { v: 'alpha', o: 0 },
        { v: 'beta', o: 1 },
      ],
      'http://purl.org/dc/terms/language': [{ v: 'ja', o: 0 }],
      'http://idpf.org/epub/vocab/package/meta/#created': [
        { v: '2024-05-06T07:08:09Z', o: 0 },
      ],
    } satisfies Meta,
    metadataOptions: {
      pageProgression: 'rtl',
      browserVersion: 'Chrome/1.2.3',
      viewerCoreVersion: '4.5.6',
    },
    tocItems: [
      {
        id: 'chapter',
        title: '第一章',
        children: [{ id: 'section', title: '節', children: [] }],
      },
    ],
    pageSizeData: [
      {
        mediaWidth: 500,
        mediaHeight: 700,
        bleedOffset: 10,
        bleedSize: 20,
      },
    ],
    preflight: undefined,
    preflightOption: [],
    image: '',
    cmyk: false,
    cmykMap: {},
    replaceImage: [],
  });

  const document = await PDFDocument.load(fs.readFileSync(output), {
    updateMetadata: false,
  });
  expect(document.getPageCount()).toBe(1);
  expect(document.getTitle()).toBe('試験文書');
  expect(document.getAuthor()).toBe('Alice; Bob');
  expect(document.getSubject()).toBe('概要');
  expect(document.getKeywords()).toBe('alpha beta');
  expect(document.getCreator()).toBe(
    'Vivliostyle (Vivliostyle.js 4.5.6; Chrome/1.2.3)',
  );
  expect(document.getCreationDate()).toEqual(new Date('2024-05-06T07:08:09Z'));
  expect(
    document.catalog.lookup(PDFName.of('Lang'), PDFString).decodeText(),
  ).toBe('ja');
  expect(
    document.catalog
      .lookup(PDFName.of('ViewerPreferences'), PDFDict)
      .get(PDFName.of('Direction'))
      ?.toString(),
  ).toBe('/R2L');

  const page = document.getPage(0);
  expect(page.getMediaBox()).toEqual({ x: 0, y: 200, width: 500, height: 700 });
  expect(page.getBleedBox()).toEqual({
    x: 10,
    y: 210,
    width: 480,
    height: 680,
  });
  expect(page.getTrimBox()).toEqual({
    x: 30,
    y: 230,
    width: 440,
    height: 640,
  });

  const outlines = document.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('2');
  const chapter = outlines.lookup(PDFName.of('First'), PDFDict);
  expect(text(chapter, 'Title')).toBe('第一章');
  expect(chapter.get(PDFName.of('Dest'))?.toString()).toBe('/chapter');
  expect(chapter.get(PDFName.of('Count'))?.toString()).toBe('1');
  const section = chapter.lookup(PDFName.of('First'), PDFDict);
  expect(text(section, 'Title')).toBe('節');
  expect(section.get(PDFName.of('Dest'))?.toString()).toBe('/section');
});

it('raises unsupported PDF 1.0 input to the minimum supported version', async () => {
  fs.mkdirSync(temporaryDir, { recursive: true });
  const output = path.join(temporaryDir, `pdf-document-${randomUUID()}.pdf`);
  onTestFinished(() => fs.rmSync(output, { force: true }));

  const document = await PDFDocument.create();
  document.addPage();
  const input = Buffer.from(await document.save({ useObjectStreams: false }));
  input.write('%PDF-1.0', 0, 'ascii');

  await postProcessPDF({
    pdf: input,
    output,
    tocItems: [{ id: 'chapter', title: 'Chapter', children: [] }],
    preflight: undefined,
    preflightOption: [],
    image: '',
    cmyk: false,
    cmykMap: {},
    replaceImage: [],
  });

  const result = fs.readFileSync(output);
  expect(result.subarray(0, 8).toString('ascii')).toBe('%PDF-1.2');
  const resultDocument = await PDFDocument.load(result);
  expect(resultDocument.catalog.has(PDFName.of('Version'))).toBe(false);
});

it('removes a trailing page before visiting its content', async () => {
  fs.mkdirSync(temporaryDir, { recursive: true });
  const output = path.join(temporaryDir, `pdf-document-${randomUUID()}.pdf`);
  onTestFinished(() => fs.rmSync(output, { force: true }));

  const input = await PDFDocument.create();
  input.addPage([600, 900]);
  input
    .addPage([600, 900])
    .drawRectangle({ width: 100, height: 100, color: rgb(1, 0, 0) });
  await postProcessPDF({
    pdf: await input.save(),
    output,
    pageSizeData: [
      {
        mediaWidth: 500,
        mediaHeight: 700,
        bleedOffset: 0,
        bleedSize: 0,
      },
    ],
    preflight: undefined,
    preflightOption: [],
    image: '',
    cmyk: {
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'ignore',
      overrideMap: [],
      reserveMap: [],
      fallback: undefined,
      mapOutput: undefined,
    },
    cmykMap: {},
    replaceImage: [],
  });

  const document = await PDFDocument.load(fs.readFileSync(output));
  expect(document.getPageCount()).toBe(1);
});

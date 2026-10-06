import fs from 'node:fs';
import path from 'node:path';

import { XMLValidator } from 'fast-xml-parser';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';
import { assert, beforeEach, expect, it, onTestFinished } from 'vitest';

import type { Meta } from '../src/global-viewer.js';
import {
  postProcessPDF,
  type SaveOption,
} from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
let temporaryDir: string;

beforeEach(() => {
  const root = path.join(import.meta.dirname, '..', '.tmp');
  fs.mkdirSync(root, { recursive: true });
  temporaryDir = fs.mkdtempSync(path.join(root, 'pdfx-'));
  onTestFinished(() =>
    fs.rmSync(temporaryDir, { recursive: true, force: true }),
  );
});

async function savePdf(
  options: Partial<SaveOption> & { metadata?: Meta } = {},
  input = fs.readFileSync(path.join(fixturesDir, 'text.pdf')),
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

function info(document: PDFDocument): PDFDict {
  const dictionary = document.context.lookup(document.context.trailerInfo.Info);
  assert(dictionary instanceof PDFDict);
  return dictionary;
}

function text(dictionary: PDFDict, key: string): string {
  const value = dictionary.lookup(PDFName.of(key));
  assert(value instanceof PDFString || value instanceof PDFHexString);
  return value.decodeText();
}

function xmp(document: PDFDocument): string {
  const metadata = document.catalog.lookup(PDFName.of('Metadata'));
  assert(metadata instanceof PDFRawStream);
  expect(metadata.dict.get(PDFName.of('Type'))?.toString()).toBe('/Metadata');
  expect(metadata.dict.get(PDFName.of('Subtype'))?.toString()).toBe('/XML');
  expect(metadata.dict.has(PDFName.of('Filter'))).toBe(false);
  return Buffer.from(metadata.contents).toString('utf8');
}

function property(packet: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`, 'v').exec(packet)?.[1];
}

function item(
  packet: string,
  name: string,
  container: string,
): string | undefined {
  return new RegExp(
    `<${name}>\\s*<${container}>\\s*(<rdf:li[^>]*>[^<]*</rdf:li>)\\s*</${container}>\\s*</${name}>`,
    'v',
  ).exec(packet)?.[1];
}

function propertyNames(packet: string): string[] {
  return [...packet.matchAll(/^ {6}<([^\s\/>][^\s>]*)>/gmv)].map(
    ([, name]) => name,
  );
}

function fileId(document: PDFDocument): string[] {
  const id = document.context.lookup(document.context.trailerInfo.ID);
  assert(id instanceof PDFArray);
  return id.asArray().map(String);
}

it('labels the output as PDF/X-4 with XMP mirroring the document information', async () => {
  const document = await savePdf({
    pdfxLabel: 'X-4',
    metadata: {
      'http://purl.org/dc/terms/creator': [{ v: 'Alice & Bob', o: 0 }],
      'http://purl.org/dc/terms/description': [{ v: '<概要>', o: 0 }],
      'http://purl.org/dc/terms/subject': [
        { v: 'alpha', o: 0 },
        { v: 'beta', o: 1 },
      ],
    } satisfies Meta,
  });

  const information = info(document);
  expect(information.has(PDFName.of('GTS_PDFXVersion'))).toBe(false);
  expect(information.has(PDFName.of('Trapped'))).toBe(false);
  expect(fileId(document)).toHaveLength(2);
  const packet = xmp(document);
  expect(XMLValidator.validate(packet)).toBe(true);
  expect(packet).toMatch(
    /^<\?xpacket begin="\u{FEFF}" id="W5M0MpCehiHzreSzNTczkc9d"\?>\n/v,
  );
  expect(packet).toMatch(/<\?xpacket end="w"\?>\n$/v);
  expect(propertyNames(packet)).toEqual([
    'pdfxid:GTS_PDFXVersion',
    'dc:title',
    'dc:creator',
    'dc:description',
    'pdf:Keywords',
    'pdf:Producer',
    'pdf:Trapped',
    'xmp:CreatorTool',
    'xmp:CreateDate',
    'xmp:ModifyDate',
    'xmp:MetadataDate',
    'xmpMM:DocumentID',
    'xmpMM:VersionID',
    'xmpMM:RenditionClass',
  ]);
  for (const namespace of [
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    'rdf:about=""',
    'xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"',
    'xmlns:dc="http://purl.org/dc/elements/1.1/"',
    'xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    'xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    'xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"',
  ]) {
    expect(packet).toContain(namespace);
  }
  expect(property(packet, 'pdfxid:GTS_PDFXVersion')).toBe('PDF/X-4');
  expect(item(packet, 'dc:title', 'rdf:Alt')).toBe(
    `<rdf:li xml:lang="x-default">${text(information, 'Title')}</rdf:li>`,
  );
  expect(item(packet, 'dc:creator', 'rdf:Seq')).toBe(
    '<rdf:li>Alice &amp; Bob</rdf:li>',
  );
  expect(item(packet, 'dc:description', 'rdf:Alt')).toBe(
    '<rdf:li xml:lang="x-default">&lt;概要&gt;</rdf:li>',
  );
  expect(property(packet, 'pdf:Keywords')).toBe(text(information, 'Keywords'));
  expect(property(packet, 'pdf:Producer')).toBe(text(information, 'Producer'));
  expect(property(packet, 'pdf:Trapped')).toBe('False');
  expect(property(packet, 'xmp:CreatorTool')).toBe(
    text(information, 'Creator'),
  );
  expect(text(information, 'CreationDate')).toBe("D:20260103122154+00'00'");
  expect(property(packet, 'xmp:CreateDate')).toBe('2026-01-03T12:21:54+00:00');
  expect(property(packet, 'xmp:ModifyDate')).toBe('2026-01-03T12:21:54+00:00');
  expect(property(packet, 'xmp:MetadataDate')).toBe(
    '2026-01-03T12:21:54+00:00',
  );
  expect(property(packet, 'xmpMM:DocumentID')).toMatch(
    /^uuid:[0-9a-f\-]{36}$/v,
  );
  expect(property(packet, 'xmpMM:VersionID')).toBe('1');
  expect(property(packet, 'xmpMM:RenditionClass')).toBe('default');
});

it('writes no XMP property for an absent document information entry', async () => {
  const document = await savePdf({ pdfxLabel: 'X-4' });

  const information = info(document);
  for (const key of ['Author', 'Subject', 'Keywords']) {
    expect(information.has(PDFName.of(key))).toBe(false);
  }
  expect(propertyNames(xmp(document))).toEqual([
    'pdfxid:GTS_PDFXVersion',
    'dc:title',
    'pdf:Producer',
    'pdf:Trapped',
    'xmp:CreatorTool',
    'xmp:CreateDate',
    'xmp:ModifyDate',
    'xmp:MetadataDate',
    'xmpMM:DocumentID',
    'xmpMM:VersionID',
    'xmpMM:RenditionClass',
  ]);
});

it('mirrors empty document information values into the XMP', async () => {
  const input = await PDFDocument.create();
  input.addPage([100, 100]);
  input.setKeywords([]);

  const document = await savePdf(
    { pdfxLabel: 'X-4' },
    Buffer.from(await input.save()),
  );

  expect(text(info(document), 'Keywords')).toBe('');
  expect(xmp(document)).toContain('<pdf:Keywords></pdf:Keywords>');
});

it('writes every CR in a document information value as a character reference', async () => {
  const input = await PDFDocument.create();
  input.addPage([100, 100]);
  input.setTitle('Line one\u{D}Line two\u{D}\u{A}Line three');

  const document = await savePdf(
    { pdfxLabel: 'X-4' },
    Buffer.from(await input.save()),
  );

  expect(item(xmp(document), 'dc:title', 'rdf:Alt')).toBe(
    '<rdf:li xml:lang="x-default">Line one&#xD;Line two&#xD;\nLine three</rdf:li>',
  );
});

it('labels the output as PDF/X-1a:2003 in the document information', async () => {
  const document = await savePdf({ pdfxLabel: 'X-1a:2003' });

  const information = info(document);
  expect(text(information, 'GTS_PDFXVersion')).toBe('PDF/X-1a:2003');
  expect(information.has(PDFName.of('GTS_PDFXConformance'))).toBe(false);
  expect(information.get(PDFName.of('Trapped'))?.toString()).toBe('/False');
  expect(fileId(document)).toHaveLength(2);
  expect(document.catalog.has(PDFName.of('Metadata'))).toBe(false);
});

it('keeps an existing file identifier, trapped state, and modification date', async () => {
  const input = await PDFDocument.create();
  input.addPage([100, 100]);
  const information = input.context.lookup(input.context.trailerInfo.Info);
  assert(information instanceof PDFDict);
  information.set(PDFName.of('Trapped'), PDFName.of('True'));
  information.set(
    PDFName.of('CreationDate'),
    PDFString.of('D:20260304153045Z'),
  );
  information.set(PDFName.of('ModDate'), PDFString.of('D:20270102030405Z'));
  const existing = Buffer.from(await input.save());
  const first = await savePdf({ pdfxLabel: 'X-4' }, existing);
  const second = await savePdf(
    { pdfxLabel: 'X-4' },
    Buffer.from(await first.save()),
  );
  const x1a = await savePdf({ pdfxLabel: 'X-1a:2003' }, existing);

  expect(property(xmp(first), 'pdf:Trapped')).toBe('True');
  expect(fileId(second)[0]).toBe(fileId(first)[0]);
  expect(info(x1a).get(PDFName.of('Trapped'))?.toString()).toBe('/True');
  expect(text(info(x1a), 'ModDate')).toBe('D:20270102030405Z');
});

it.each([
  ['D:20260304153045Z', '2026-03-04T15:30:45Z'],
  ["D:20260304153045-09'30'", '2026-03-04T15:30:45-09:30'],
  ["D:20260304153045+09'30", '2026-03-04T15:30:45+09:30'],
])(
  'mirrors the document information date %s as %s',
  async (pdfDate, xmpDate) => {
    const input = await PDFDocument.create();
    input.addPage([100, 100]);
    const information = input.context.lookup(input.context.trailerInfo.Info);
    assert(information instanceof PDFDict);
    information.set(PDFName.of('CreationDate'), PDFString.of(pdfDate));
    information.set(PDFName.of('ModDate'), PDFString.of('D:20270102030405Z'));

    const document = await savePdf(
      { pdfxLabel: 'X-4' },
      Buffer.from(await input.save()),
    );

    const packet = xmp(document);
    expect(text(info(document), 'CreationDate')).toBe(pdfDate);
    expect(property(packet, 'xmp:CreateDate')).toBe(xmpDate);
    expect(property(packet, 'xmp:ModifyDate')).toBe('2027-01-02T03:04:05Z');
    expect(property(packet, 'xmp:MetadataDate')).toBe('2027-01-02T03:04:05Z');
  },
);

it('takes the modification date from the creation date without a ModDate', async () => {
  const input = await PDFDocument.create();
  input.addPage([100, 100]);
  const information = input.context.lookup(input.context.trailerInfo.Info);
  assert(information instanceof PDFDict);
  information.set(
    PDFName.of('CreationDate'),
    PDFString.of("D:20261007162716+09'00"),
  );
  information.delete(PDFName.of('ModDate'));
  const withoutModDate = Buffer.from(await input.save());

  const document = await savePdf({ pdfxLabel: 'X-4' }, withoutModDate);
  const x1a = await savePdf({ pdfxLabel: 'X-1a:2003' }, withoutModDate);

  expect(text(info(x1a), 'ModDate')).toBe("D:20261007162716+09'00");
  const packet = xmp(document);
  expect(info(document).has(PDFName.of('ModDate'))).toBe(false);
  expect(property(packet, 'xmp:CreateDate')).toBe('2026-10-07T16:27:16+09:00');
  expect(property(packet, 'xmp:ModifyDate')).toBe('2026-10-07T16:27:16+09:00');
  expect(property(packet, 'xmp:MetadataDate')).toBe(
    '2026-10-07T16:27:16+09:00',
  );
});

it('writes no label when the option is omitted', async () => {
  const document = await savePdf();

  expect(document.catalog.has(PDFName.of('Metadata'))).toBe(false);
  expect(info(document).has(PDFName.of('GTS_PDFXVersion'))).toBe(false);
  expect(document.context.trailerInfo.ID).toBeUndefined();
});

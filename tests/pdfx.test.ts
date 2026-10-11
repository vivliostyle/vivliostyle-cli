import fs from 'node:fs';
import path from 'node:path';

import { XMLValidator } from 'fast-xml-parser';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  type PDFRef,
  PDFString,
} from 'pdf-lib';
import { assert, beforeEach, expect, it, onTestFinished, vi } from 'vitest';

import type { PdfxConfig } from '../src/config/resolve.js';
import type { Meta } from '../src/global-viewer.js';
import { Logger } from '../src/logger.js';
import {
  postProcessPDF,
  type SaveOption,
} from '../src/output/pdf-postprocess.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
const cmykProfile = path.join(fixturesDir, 'ps_cmyk.icc');
let temporaryDir: string;

beforeEach(() => {
  const root = path.join(import.meta.dirname, '..', '.tmp');
  fs.mkdirSync(root, { recursive: true });
  temporaryDir = fs.mkdtempSync(path.join(root, 'pdfx-'));
  onTestFinished(() =>
    fs.rmSync(temporaryDir, { recursive: true, force: true }),
  );
});

function pdfx(
  version: PdfxConfig['version'],
  profile = cmykProfile,
): Pick<SaveOption, 'pdfx'> {
  return { pdfx: { version, outputIntent: profile } };
}

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

it('labels the output as PDF/X-4 with XMP mirroring the document information', async () => {
  const document = await savePdf({
    ...pdfx('X-4'),
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
  expect(outputIntent(document).get(PDFName.of('S'))?.toString()).toBe(
    '/GTS_PDFX',
  );
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
  const document = await savePdf(pdfx('X-4'));

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

  const document = await savePdf(pdfx('X-4'), Buffer.from(await input.save()));

  expect(text(info(document), 'Keywords')).toBe('');
  expect(xmp(document)).toContain('<pdf:Keywords></pdf:Keywords>');
});

it('writes every CR in a document information value as a character reference', async () => {
  const input = await PDFDocument.create();
  input.addPage([100, 100]);
  input.setTitle('Line one\u{D}Line two\u{D}\u{A}Line three');

  const document = await savePdf(pdfx('X-4'), Buffer.from(await input.save()));

  expect(item(xmp(document), 'dc:title', 'rdf:Alt')).toBe(
    '<rdf:li xml:lang="x-default">Line one&#xD;Line two&#xD;\nLine three</rdf:li>',
  );
});

it('labels the output as PDF/X-1a:2003 in the document information', async () => {
  const document = await savePdf(pdfx('X-1a:2003'));

  const information = info(document);
  expect(text(information, 'GTS_PDFXVersion')).toBe('PDF/X-1a:2003');
  expect(information.has(PDFName.of('GTS_PDFXConformance'))).toBe(false);
  expect(information.get(PDFName.of('Trapped'))?.toString()).toBe('/False');
  expect(fileId(document)).toHaveLength(2);
  expect(outputIntent(document).get(PDFName.of('S'))?.toString()).toBe(
    '/GTS_PDFX',
  );
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
  const first = await savePdf(pdfx('X-4'), existing);
  const second = await savePdf(pdfx('X-4'), Buffer.from(await first.save()));
  const x1a = await savePdf(pdfx('X-1a:2003'), existing);

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
      pdfx('X-4'),
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

  const document = await savePdf(pdfx('X-4'), withoutModDate);
  const x1a = await savePdf(pdfx('X-1a:2003'), withoutModDate);

  expect(text(info(x1a), 'ModDate')).toBe("D:20261007162716+09'00");
  const packet = xmp(document);
  expect(info(document).has(PDFName.of('ModDate'))).toBe(false);
  expect(property(packet, 'xmp:CreateDate')).toBe('2026-10-07T16:27:16+09:00');
  expect(property(packet, 'xmp:ModifyDate')).toBe('2026-10-07T16:27:16+09:00');
  expect(property(packet, 'xmp:MetadataDate')).toBe(
    '2026-10-07T16:27:16+09:00',
  );
});

it.each([
  ['ps_cmyk.icc', 4],
  ['ps_gray.icc', 1],
] as const)(
  'embeds %s as the output intent without changing existing PDF streams',
  async (filename, components) => {
    const input = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const original = await PDFDocument.load(input, { updateMetadata: false });
    const warning = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
    onTestFinished(() => warning.mockRestore());

    const document = await savePdf(
      pdfx('X-4', path.join(fixturesDir, filename)),
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

it('raises the PDF version required by an output intent', async () => {
  const input = Buffer.from(
    fs.readFileSync(path.join(fixturesDir, 'image.pdf')),
  );
  input.write('%PDF-1.3', 0, 'ascii');

  await savePdf(pdfx('X-4', path.join(fixturesDir, 'ps_gray.icc')), input);

  const output = fs.readFileSync(path.join(temporaryDir, 'output.pdf'));
  expect(output.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
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

  const document = await savePdf(pdfx('X-4', profilePath));
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
  const initial = await savePdf(
    pdfx('X-4', path.join(fixturesDir, 'ps_gray.icc')),
  );
  const input = Buffer.from(await initial.save());
  const unchanged = await savePdf({}, input);
  const replaced = await savePdf(pdfx('X-4'), input);

  expect(
    outputIntent(unchanged).lookup(PDFName.of('Info'), PDFString).decodeText(),
  ).toBe('ps_gray.icc');
  expect(
    outputIntent(replaced).lookup(PDFName.of('Info'), PDFString).decodeText(),
  ).toBe('ps_cmyk.icc');
});

it('fails without writing output when the profile cannot be read', async () => {
  await expect(
    savePdf(pdfx('X-4', path.join(temporaryDir, 'missing.icc'))),
  ).rejects.toThrow('missing.icc');

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

it('propagates a profile loading failure', async () => {
  await expect(
    savePdf(pdfx('X-4', path.join(fixturesDir, 'image.pdf'))),
  ).rejects.toThrow(Error);

  expect(fs.existsSync(path.join(temporaryDir, 'output.pdf'))).toBe(false);
});

it('writes no label when the option is omitted', async () => {
  const document = await savePdf();

  expect(document.catalog.has(PDFName.of('Metadata'))).toBe(false);
  expect(document.catalog.has(PDFName.of('OutputIntents'))).toBe(false);
  expect(info(document).has(PDFName.of('GTS_PDFXVersion'))).toBe(false);
  expect(document.context.trailerInfo.ID).toBeUndefined();
});

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CmykConvertFunction } from '../src/config/cmyk.js';
import type { CmykConfig } from '../src/config/resolve.js';
import type { CmykMap } from '../src/global-viewer.js';
import { createCmykColorHook } from '../src/output/cmyk.js';
import { editPdf } from '../src/output/pdf-visitor.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
const signal = AbortSignal.any([]);

function convertCmykColors({
  pdf,
  colorMap,
  fallback,
  ifUnmappedColorsFound,
  failures,
}: {
  pdf: Uint8Array;
  colorMap: CmykMap;
  fallback?: CmykConvertFunction;
  ifUnmappedColorsFound: CmykConfig['ifUnmappedColorsFound'];
  failures: string[];
}): Promise<Uint8Array> {
  const hook = createCmykColorHook(
    new Map(Object.entries(colorMap)),
    fallback,
    ifUnmappedColorsFound,
    failures,
  );
  return editPdf(pdf, [hook], { signal });
}

/**
 * Helper to extract text content from a PDF content stream
 */
async function extractPdfContentStream(pdf: Uint8Array): Promise<string[]> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;

  const contents: string[] = [];
  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i) as import('mupdf').PDFPage;
    const pageObj = page.getObject().resolve();
    const contentObj = pageObj.get('Contents');

    if (contentObj?.isStream()) {
      const buffer = contentObj.readStream();
      contents.push(buffer.asString());
    } else if (contentObj?.isArray()) {
      for (let j = 0; j < contentObj.length; j++) {
        const streamObj = contentObj.get(j);
        if (streamObj?.isStream()) {
          const buffer = streamObj.resolve().readStream();
          contents.push(buffer.asString());
        }
      }
    }
  }

  doc.destroy();
  return contents;
}

async function addAnnotationAppearance(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const pageObject = page.getObject().resolve();
  const appearanceDictionary = doc.newDictionary();
  appearanceDictionary.put('Type', doc.newName('XObject'));
  appearanceDictionary.put('Subtype', doc.newName('Form'));
  const bbox = doc.newArray();
  for (const value of [0, 0, 1, 1]) {
    bbox.push(doc.newInteger(value));
  }
  appearanceDictionary.put('BBox', bbox);
  const appearance = doc.addStream('1 0 0 rg', appearanceDictionary);
  const appearanceStates = doc.newDictionary();
  appearanceStates.put('N', appearance);
  const annotation = doc.newDictionary();
  annotation.put('AP', appearanceStates);
  const annotations = doc.newArray();
  annotations.push(doc.addObject(annotation));
  pageObject.put('Annots', annotations);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function replacePageContentsWithRepeatedColorStreams(
  pdf: Uint8Array,
  streamCount: number,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const contents = doc.newArray();
  for (let index = 0; index < streamCount; index++) {
    contents.push(doc.addStream('0.1 0.2 0.3 rg', doc.newDictionary()));
  }
  page.getObject().resolve().put('Contents', contents);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function getAnnotationAppearance(pdf: Uint8Array): Promise<string> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const appearance = page
    .getObject()
    .resolve()
    .get('Annots')
    .get(0)
    .resolve()
    .get('AP')
    .get('N');
  const content = appearance.readStream();
  const result = content.asString();
  content.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

/**
 * Helper to check if PDF contains CMYK color operators
 */
function containsCmykOperators(content: string): boolean {
  // CMYK operators: 'k' (non-stroking) and 'K' (stroking)
  // Pattern: four numbers followed by k or K
  return /\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+[kK]\b/v.test(
    content,
  );
}

/**
 * Helper to check if PDF contains RGB color operators
 */
function containsRgbOperators(content: string): boolean {
  // RGB operators: 'rg' (non-stroking) and 'RG' (stroking)
  // Pattern: three numbers followed by rg or RG
  return /\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+(?:rg|RG)\b/v.test(content);
}

describe('convertCmykColors', () => {
  it('converts RGB colors to CMYK in PDF content stream', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const colorMap: CmykMap = {
      '[0,0,0]': { c: 0, m: 0, y: 0, k: 10000 },
      '[2000,2000,2000]': { c: 0, m: 0, y: 0, k: 8000 },
      '[4000,4000,4000]': { c: 0, m: 0, y: 0, k: 6000 },
      '[6000,6000,6000]': { c: 0, m: 0, y: 0, k: 4000 },
      '[8000,8000,8000]': { c: 0, m: 0, y: 0, k: 2000 },
      '[0,10000,10000]': { c: 10000, m: 0, y: 0, k: 0 },
      '[2000,10000,10000]': { c: 8000, m: 0, y: 0, k: 0 },
      '[4000,10000,10000]': { c: 6000, m: 0, y: 0, k: 0 },
      '[6000,10000,10000]': { c: 4000, m: 0, y: 0, k: 0 },
      '[8000,10000,10000]': { c: 2000, m: 0, y: 0, k: 0 },
    };

    // Verify source PDF contains RGB operators
    const srcContents = await extractPdfContentStream(srcPdf);
    const srcHasRgb = srcContents.some((content) =>
      containsRgbOperators(content),
    );
    expect(srcHasRgb).toBe(true);

    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      colorMap,
      ifUnmappedColorsFound: 'ignore',
      failures: [],
    });

    // Verify destination PDF contains CMYK operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasCmyk = destContents.some((content) =>
      containsCmykOperators(content),
    );
    expect(destHasCmyk).toBe(true);
  });

  it('handles PDF with mix-blend-mode (Form XObjects)', async () => {
    // https://github.com/vivliostyle/vivliostyle-cli/issues/735
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'blend-mode.pdf'));

    const colorMap: CmykMap = {
      '[0,0,0]': { c: 0, m: 0, y: 0, k: 10000 },
      '[10000,10000,10000]': { c: 0, m: 0, y: 0, k: 0 },
      '[10000,0,0]': { c: 0, m: 10000, y: 10000, k: 0 },
      '[0,0,10000]': { c: 10000, m: 10000, y: 0, k: 0 },
    };

    // This should not throw "object is not a stream" error
    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      colorMap,
      ifUnmappedColorsFound: 'ignore',
      failures: [],
    });

    expect(destPdf).toBeInstanceOf(Uint8Array);
    expect(destPdf.length).toBeGreaterThan(0);
  });

  it('converts colors in annotation appearance streams', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));
    const annotatedPdf = await addAnnotationAppearance(srcPdf);

    const destPdf = await convertCmykColors({
      pdf: annotatedPdf,
      colorMap: {
        '[10000,0,0]': { c: 0, m: 10000, y: 10000, k: 0 },
      },
      ifUnmappedColorsFound: 'ignore',
      failures: [],
    });

    expect(await getAnnotationAppearance(destPdf)).toBe('0 1 1 0 k');
  });

  it('reports unmapped colors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));
    const failures: string[] = [];

    await convertCmykColors({
      pdf: srcPdf,
      colorMap: {},
      ifUnmappedColorsFound: 'error',
      failures,
    });

    expect(failures).toEqual([
      expect.stringMatching(/^\d+ RGB color\(s\) not mapped to CMYK$/v),
    ]);
  });

  it('stores repeated unmapped colors once across content streams', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));
    const repeatedColorPdf = await replacePageContentsWithRepeatedColorStreams(
      srcPdf,
      64,
    );
    const failures: string[] = [];
    const hook = createCmykColorHook(new Map(), undefined, 'error', failures);
    await editPdf(repeatedColorPdf, [hook], { signal });

    expect(failures).toEqual(['1 RGB color(s) not mapped to CMYK']);
  });

  it('preserves unmapped RGB colors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      // no colors will be converted
      colorMap: {},
      ifUnmappedColorsFound: 'ignore',
      failures: [],
    });

    // Verify destination PDF still contains RGB operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasRgb = destContents.some((content) =>
      containsRgbOperators(content),
    );
    expect(destHasRgb).toBe(true);
  });
});

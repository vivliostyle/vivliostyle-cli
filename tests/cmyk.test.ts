import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CmykMap } from '../src/global-viewer.js';
import { convertCmykColors, mapToConverter } from '../src/output/cmyk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'cmyk');

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

/**
 * Helper to check if PDF contains CMYK color operators
 */
function containsCmykOperators(content: string): boolean {
  // CMYK operators: 'k' (non-stroking) and 'K' (stroking)
  // Pattern: four numbers followed by k or K
  return /\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+[kK]\b/.test(content);
}

/**
 * Helper to check if PDF contains RGB color operators
 */
function containsRgbOperators(content: string): boolean {
  // RGB operators: 'rg' (non-stroking) and 'RG' (stroking)
  // Pattern: three numbers followed by rg or RG
  return /\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+(?:rg|RG)\b/.test(content);
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
    const srcHasRgb = srcContents.some(containsRgbOperators);
    expect(srcHasRgb).toBe(true);

    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      converters: [mapToConverter(colorMap)],
      warnUnmapped: false,
    });

    // Verify destination PDF contains CMYK operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasCmyk = destContents.some(containsCmykOperators);
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
      converters: [mapToConverter(colorMap)],
      warnUnmapped: false,
    });

    expect(destPdf).toBeInstanceOf(Uint8Array);
    expect(destPdf.length).toBeGreaterThan(0);
  });

  it('preserves unmapped RGB colors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      converters: [], // no colors will be converted
      warnUnmapped: false,
    });

    // Verify destination PDF still contains RGB operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasRgb = destContents.some(containsRgbOperators);
    expect(destHasRgb).toBe(true);
  });

  it('converts colors using a CmykConvertFunction fallback', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    // Verify source has RGB
    const srcContents = await extractPdfContentStream(srcPdf);
    expect(srcContents.some(containsRgbOperators)).toBe(true);

    // Use a function that converts all colors to K100
    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      converters: [(rgb) => ({ c: 0, m: 0, y: 0, k: 10000 })],
      warnUnmapped: false,
    });

    const destContents = await extractPdfContentStream(destPdf);
    expect(destContents.some(containsCmykOperators)).toBe(true);
    expect(destContents.some(containsRgbOperators)).toBe(false);
  });

  it('static map entries take priority over function fallback', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    // Static map for black, function for everything else
    const colorMap: CmykMap = {
      [JSON.stringify([0, 0, 0])]: { c: 0, m: 0, y: 0, k: 10000 },
    };
    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      converters: [
        mapToConverter(colorMap),
        (rgb) => ({ c: 5000, m: 5000, y: 5000, k: 0 }),
      ],
      warnUnmapped: false,
    });

    const destContents = await extractPdfContentStream(destPdf);
    // All RGB should be converted (no RGB operators remaining)
    expect(destContents.some(containsRgbOperators)).toBe(false);
    expect(destContents.some(containsCmykOperators)).toBe(true);
  });
});

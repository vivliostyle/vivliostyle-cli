import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CmykMap } from '../src/global-viewer.js';
import { convertCmykColors } from '../src/output/cmyk.js';

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
      colorMap,
      warnUnmapped: false,
    });

    // Verify destination PDF contains CMYK operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasCmyk = destContents.some(containsCmykOperators);
    expect(destHasCmyk).toBe(true);
  });

  it('preserves unmapped RGB colors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const destPdf = await convertCmykColors({
      pdf: srcPdf,
      colorMap: {}, // no colors will be converted
      warnUnmapped: false,
    });

    // Verify destination PDF still contains RGB operators
    const destContents = await extractPdfContentStream(destPdf);
    const destHasRgb = destContents.some(containsRgbOperators);
    expect(destHasRgb).toBe(true);
  });
});

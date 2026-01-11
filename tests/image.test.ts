import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { replaceImages } from '../src/output/image.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'cmyk');

/**
 * Helper to extract image color space from PDF
 */
async function getImageColorSpace(
  pdf: Uint8Array,
): Promise<'RGB' | 'CMYK' | 'Gray' | 'Unknown'> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;

  const page = doc.loadPage(0) as import('mupdf').PDFPage;
  const pageObj = page.getObject().resolve();
  const res = pageObj.get('Resources');

  if (!res?.isDictionary()) {
    doc.destroy();
    return 'Unknown';
  }

  const xobjects = res.get('XObject');
  if (!xobjects?.isDictionary()) {
    doc.destroy();
    return 'Unknown';
  }

  let colorSpace: 'RGB' | 'CMYK' | 'Gray' | 'Unknown' = 'Unknown';

  xobjects.forEach((value) => {
    const resolved = value.resolve();
    const subtype = resolved.get('Subtype');

    if (subtype?.toString() === '/Image') {
      const pdfImage = doc.loadImage(value);
      const pixmap = pdfImage.toPixmap();
      const cs = pixmap.getColorSpace();

      if (cs?.isRGB()) {
        colorSpace = 'RGB';
      } else if (cs?.isCMYK()) {
        colorSpace = 'CMYK';
      } else if (cs?.isGray()) {
        colorSpace = 'Gray';
      }
    }
  });

  doc.destroy();
  return colorSpace;
}

describe('replaceImages', () => {
  it('replaces RGB image with CMYK image in PDF', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const srcImagePath = path.join(fixturesDir, 'ck_rgb.png');
    const destImagePath = path.join(fixturesDir, 'ck_cmyk.tiff');

    // Verify source PDF has RGB image
    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: srcImagePath,
          replacement: destImagePath,
        },
      ],
    });

    // Verify destination PDF has CMYK image
    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('returns original PDF when replaceImageConfig is empty', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [],
    });

    // Should return the same PDF
    expect(destPdf).toEqual(srcPdf);
  });
});

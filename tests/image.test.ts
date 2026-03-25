import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ImageContext } from '../src/config/resolve.js';
import {
  builtinCmykConversion,
  findNonCmykImages,
  replaceImages,
} from '../src/output/image.js';
import { Logger } from '../src/logger.js';

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

  it('replaces RGB image using a bare ReplaceFunction', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        async (image: ImageContext) => {
          const mupdf = await import('mupdf');
          const img = new mupdf.Image(image.asPNG());
          const pixmap = img.toPixmap();
          const cmykPixmap = pixmap.convertToColorSpace(
            mupdf.ColorSpace.DeviceCMYK,
          );
          return cmykPixmap.asPAM();
        },
      ],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('replaces image using file-to-function entry', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const srcImagePath = path.join(fixturesDir, 'ck_rgb.png');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: srcImagePath,
          replacement: async (image: ImageContext) => {
            const mupdf = await import('mupdf');
            const img = new mupdf.Image(image.asPNG());
            const pixmap = img.toPixmap();
            const cmykPixmap = pixmap.convertToColorSpace(
              mupdf.ColorSpace.DeviceCMYK,
            );
            return cmykPixmap.asPAM();
          },
        },
      ],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('file entry takes precedence over bare function (first match wins)', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const srcImagePath = path.join(fixturesDir, 'ck_rgb.png');
    const destImagePath = path.join(fixturesDir, 'ck_cmyk.tiff');

    let functionCalled = false;
    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        { source: srcImagePath, replacement: destImagePath },
        (_image: ImageContext) => {
          functionCalled = true;
          return new Uint8Array();
        },
      ],
    });

    // File entry matched first, so the function should not have been called
    expect(functionCalled).toBe(false);
    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('builtinCmykConversion converts RGB image to CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykConversion],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });
});

describe('findNonCmykImages', () => {
  it('warns about RGB images in PDF', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    await findNonCmykImages(srcPdf);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Non-CMYK image remaining in PDF'),
    );
    spy.mockRestore();
  });

  it('does not warn when all images are CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    // Replace RGB image with CMYK first
    const cmykPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykConversion],
    });

    const spy = vi.spyOn(Logger, 'logWarn');
    await findNonCmykImages(cmykPdf);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ImageContext } from '../src/config/resolve.js';
import {
  builtinCmykReplacement,
  builtinGrayReplacement,
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

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        { source: srcImagePath, replacement: destImagePath },
        builtinGrayReplacement,
      ],
    });

    // File entry matched first producing CMYK, not Gray from the fallback
    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('skips entries with nonexistent source file', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        { source: '/nonexistent/source.png', replacement: 'any.tiff' },
      ],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load source image'),
    );
    expect(destPdf).toEqual(srcPdf);
    spy.mockRestore();
  });

  it('skips entries with nonexistent replacement file', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const srcImagePath = path.join(fixturesDir, 'ck_rgb.png');
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        { source: srcImagePath, replacement: '/nonexistent/dest.tiff' },
      ],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load replacement image'),
    );
    expect(destPdf).toEqual(srcPdf);
    spy.mockRestore();
  });

  it('catches and warns on ReplaceFunction errors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        () => {
          throw new Error('test error');
        },
      ],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply replacement function'),
    );
    // PDF should still be returned (image left unchanged)
    expect(destPdf).toBeInstanceOf(Uint8Array);
    spy.mockRestore();
  });

  it('builtinCmykReplacement converts RGB image to CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  it('builtinGrayReplacement converts RGB image to Gray', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('Gray');
  });
});

describe('findNonCmykImages', () => {
  it('warns about RGB images in PDF', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    await findNonCmykImages(srcPdf);

    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(
        /Non-CMYK image remaining in PDF: \d+x\d+ on page \d+/,
      ),
    );
    spy.mockRestore();
  });

  it('does not warn when all images are CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    // Replace RGB image with CMYK first
    const cmykPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement],
    });

    const spy = vi.spyOn(Logger, 'logWarn');
    await findNonCmykImages(cmykPdf);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not warn when all images are Gray', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const grayPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement],
    });

    const spy = vi.spyOn(Logger, 'logWarn');
    await findNonCmykImages(grayPdf);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not warn for PDF with no images', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const spy = vi.spyOn(Logger, 'logWarn');
    await findNonCmykImages(srcPdf);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ImageContext } from '../src/config/resolve.js';
import {
  builtinCmykConversion,
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

  try {
    const page = doc.loadPage(0) as import('mupdf').PDFPage;
    try {
      const pageObj = page.getObject().resolve();
      const res = pageObj.get('Resources');
      if (!res?.isDictionary()) return 'Unknown';

      const xobjects = res.get('XObject');
      if (!xobjects?.isDictionary()) return 'Unknown';

      let colorSpace: 'RGB' | 'CMYK' | 'Gray' | 'Unknown' = 'Unknown';

      xobjects.forEach((value) => {
        const resolved = value.resolve();
        if (resolved.get('Subtype')?.toString() !== '/Image') return;

        const pdfImage = doc.loadImage(value);
        const pixmap = pdfImage.toPixmap();
        const cs = pixmap.getColorSpace();

        if (cs?.isRGB()) colorSpace = 'RGB';
        else if (cs?.isCMYK()) colorSpace = 'CMYK';
        else if (cs?.isGray()) colorSpace = 'Gray';

        pixmap.destroy();
        pdfImage.destroy();
      });

      return colorSpace;
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
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
        builtinGrayReplacement(),
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

  it('catches and warns on file-to-function ReplaceFunction errors', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const srcImagePath = path.join(fixturesDir, 'ck_rgb.png');
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: srcImagePath,
          replacement: () => {
            throw new Error('test error');
          },
        },
      ],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply replacement function'),
    );
    expect(destPdf).toBeInstanceOf(Uint8Array);
    spy.mockRestore();
  });

  it('builtinCmykReplacement converts RGB image to CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('CMYK');
  });

  // ICC profile-based conversion internally calls mupdf.enableICC(), which
  // mutates global WASM state. If that state leaks, subsequent non-ICC
  // conversions produce different results. This test runs a no-profile
  // conversion before and after a profile-based one and asserts the outputs
  // are identical, catching any state pollution.
  it('builtinCmykReplacement with ICC profiles does not pollute global state', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const cmykProfile = fs.readFileSync(
      path.join(fixturesDir, 'default_cmyk.icc'),
    );

    // 1. Convert without profile
    const pdf1 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });

    // 2. Convert with a real ICC profile (uses separate WASM instance)
    const pdf2 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        builtinCmykReplacement({ outputProfile: cmykProfile }),
      ],
    });

    // ICC profile should produce different output than DeviceCMYK
    expect(Buffer.compare(Buffer.from(pdf1), Buffer.from(pdf2))).not.toBe(0);

    // 3. Convert without profile again
    const pdf3 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });

    // 1 and 3 must be identical — ICC state must not leak
    expect(Buffer.compare(Buffer.from(pdf1), Buffer.from(pdf3))).toBe(0);
  });

  it('builtinGrayReplacement converts RGB image to Gray', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const srcColorSpace = await getImageColorSpace(srcPdf);
    expect(srcColorSpace).toBe('RGB');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    const destColorSpace = await getImageColorSpace(destPdf);
    expect(destColorSpace).toBe('Gray');
  });

  // Same ICC state isolation test as CMYK, but for Gray
  it('builtinGrayReplacement with ICC profiles does not pollute global state', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const grayProfile = fs.readFileSync(
      path.join(fixturesDir, 'default_gray.icc'),
    );

    const pdf1 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    const pdf2 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        builtinGrayReplacement({ outputProfile: grayProfile }),
      ],
    });

    expect(Buffer.compare(Buffer.from(pdf1), Buffer.from(pdf2))).not.toBe(0);

    const pdf3 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(Buffer.compare(Buffer.from(pdf1), Buffer.from(pdf3))).toBe(0);
  });
});

describe('builtinCmykConversion', () => {
  it('converts black to mostly K', async () => {
    const fn = builtinCmykConversion();
    const result = await fn({ r: 0, g: 0, b: 0 });
    // DeviceCMYK conversion is implementation-specific; K should dominate
    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero CMYK', async () => {
    const fn = builtinCmykConversion();
    const result = await fn({ r: 10000, g: 10000, b: 10000 });
    expect(result.c).toBeLessThan(500);
    expect(result.m).toBeLessThan(500);
    expect(result.y).toBeLessThan(500);
    expect(result.k).toBeLessThan(500);
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
      replaceImageConfig: [builtinCmykReplacement()],
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
      replaceImageConfig: [builtinGrayReplacement()],
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

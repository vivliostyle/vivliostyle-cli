import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { replaceImages } from '../src/output/image.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');

/**
 * Helper to extract image color space from PDF
 */
async function getImageColorSpace(
  pdf: Uint8Array,
): Promise<{ object: string; image: string } | undefined> {
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
    return undefined;
  }

  const xobjects = res.get('XObject');
  if (!xobjects?.isDictionary()) {
    doc.destroy();
    return undefined;
  }

  let colorSpace: { object: string; image: string } | undefined;

  xobjects.forEach((value) => {
    const resolved = value.resolve();
    const subtype = resolved.get('Subtype');

    if (subtype?.toString() === '/Image') {
      const objectColorSpace = resolved.get('ColorSpace').resolve();
      const pdfImage = doc.loadImage(value);
      const imageColorSpace = pdfImage.getColorSpace();
      colorSpace = {
        object: objectColorSpace.isArray()
          ? objectColorSpace.get(0).toString()
          : objectColorSpace.toString(),
        image: imageColorSpace?.getName() ?? 'Unknown',
      };
    }
  });

  doc.destroy();
  return colorSpace;
}

describe('replaceImages', () => {
  it.each([
    ['Gray', 'ck_gray.pgm', '/DeviceGray', 'DeviceGray'],
    ['RGB', 'ck_rgb.png', '/DeviceRGB', 'DeviceRGB'],
    ['CMYK', 'ck_cmyk.tiff', '/DeviceCMYK', 'DeviceCMYK'],
  ])(
    'embeds a Device%s replacement using the direct device color space',
    async (_, replacement, objectColorSpace, imageColorSpace) => {
      const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
      const destPdf = await replaceImages({
        pdf: srcPdf,
        replaceImageConfig: [
          {
            source: path.join(fixturesDir, 'ck_rgb.png'),
            replacement: path.join(fixturesDir, replacement),
          },
        ],
      });

      expect(await getImageColorSpace(destPdf)).toEqual({
        object: objectColorSpace,
        image: imageColorSpace,
      });
    },
  );

  it('preserves an ICCBased replacement color space', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, '..', 'cover', 'arch.jpg'),
        },
      ],
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/ICCBased',
      image: 'ICCBased(RGB,sRGB IEC61966-2.1)',
    });
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

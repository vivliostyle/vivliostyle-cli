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

function findFirstImageXObject(xobjects: import('mupdf').PDFObject): {
  key: string | number;
  value: import('mupdf').PDFObject;
} {
  let found:
    | { key: string | number; value: import('mupdf').PDFObject }
    | undefined;
  xobjects.forEach((value, key) => {
    if (
      found === undefined &&
      value.resolve().get('Subtype')?.toString() === '/Image'
    ) {
      found = { key, value };
    }
  });
  if (!found) {
    throw new Error('No image XObject found');
  }
  return found;
}

async function convertFirstImageToIndexed(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const resolved = value.resolve();
  const width = resolved.get('Width').asNumber();
  const height = resolved.get('Height').asNumber();
  const palette = doc.addRawStream(
    new Uint8Array([255, 0, 0, 0, 0, 255]),
    doc.newDictionary(),
  );
  const colorSpace = doc.newArray();
  for (const entry of [
    doc.newName('Indexed'),
    doc.newName('DeviceRGB'),
    doc.newInteger(1),
    palette,
  ]) {
    colorSpace.push(entry);
  }
  resolved.put('ColorSpace', colorSpace);
  resolved.put('BitsPerComponent', doc.newInteger(8));
  resolved.delete('Filter');
  resolved.delete('DecodeParms');
  value.writeRawStream(
    new Uint8Array(width * height).map((_, index) => index % 2),
  );
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

describe('replaceImages', () => {
  it.each([
    ['Gray', 'ck_gray.pgm', '/DeviceGray', 'DeviceGray', 0],
    ['RGB', 'ck_rgb.png', '/DeviceRGB', 'DeviceRGB', 1],
    ['CMYK', 'ck_cmyk.tiff', '/DeviceCMYK', 'DeviceCMYK', 0],
  ])(
    'embeds a Device%s replacement using the direct device color space',
    async (
      _,
      replacement,
      objectColorSpace,
      imageColorSpace,
      incompatibleCount,
    ) => {
      const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
      const { pdf: destPdf, incompatibleImages } = await replaceImages(srcPdf, {
        replacements: [
          {
            source: path.join(fixturesDir, 'ck_rgb.png'),
            replacement: path.join(fixturesDir, replacement),
          },
        ],
        ifIncompatibleImagesFound: 'warn',
      });

      expect(await getImageColorSpace(destPdf)).toEqual({
        object: objectColorSpace,
        image: imageColorSpace,
      });
      expect(incompatibleImages).toHaveLength(incompatibleCount);
    },
  );

  it('preserves an ICCBased replacement color space', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const { pdf: destPdf, incompatibleImages } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, '..', 'cover', 'arch.jpg'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/ICCBased',
      image: 'ICCBased(RGB,sRGB IEC61966-2.1)',
    });
    expect(incompatibleImages).toEqual([
      expect.objectContaining({
        colorSpace: expect.stringMatching(/^ICCBased/v),
      }),
    ]);
  });

  it('returns the original PDF without scanning when replacements are empty and the policy is ignore', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const result = await replaceImages(srcPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(result).toEqual({ pdf: srcPdf, incompatibleImages: [] });
  });

  it('reports incompatible images when replacements are empty', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const result = await replaceImages(pdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.pdf).toEqual(pdf);
    expect(result.incompatibleImages).toEqual([
      {
        key: expect.anything(),
        colorSpace: expect.any(String),
        width: expect.any(Number),
        height: expect.any(Number),
        pageIndex: 0,
      },
    ]);
  });

  it('reports indexed RGB images', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const indexedPdf = await convertFirstImageToIndexed(pdf);

    const result = await replaceImages(indexedPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.incompatibleImages).toHaveLength(1);
  });

  it('reports unmatched images encountered by the replacement scan', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const result = await replaceImages(pdf, {
      replacements: [
        {
          source: path.join(fixturesDir, '..', 'cover', 'arch.jpg'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'error',
    });

    expect(result.incompatibleImages).toHaveLength(1);
  });

  it('accepts PDFs without images', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const result = await replaceImages(pdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.incompatibleImages).toEqual([]);
  });
});

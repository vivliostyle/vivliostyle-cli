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

async function getXrefImageColorSpaces(pdf: Uint8Array): Promise<string[]> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const colorSpaces: string[] = [];

  for (
    let objectNumber = 1;
    objectNumber < doc.countObjects();
    objectNumber++
  ) {
    try {
      const ref = doc.newIndirect(objectNumber);
      if (ref.resolve().get('Subtype')?.toString() !== '/Image') {
        continue;
      }
      const image = doc.loadImage(ref);
      colorSpaces.push(image.getColorSpace()?.getName() ?? 'Unknown');
      image.destroy();
    } catch {
      continue;
    }
  }

  doc.destroy();
  return colorSpaces;
}

async function addUnreferencedObject(
  pdf: Uint8Array,
  type: string,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const object = doc.newDictionary();
  object.put('Type', doc.newName(type));
  doc.addObject(object);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  doc.destroy();
  return result;
}

function collectReachableObjectNumbers(
  root: import('mupdf').PDFObject,
): Set<number> {
  const reachable = new Set<number>();
  const pending = [root];

  while (pending.length > 0) {
    const object = pending.pop();
    if (!object) {
      break;
    }
    if (object.isIndirect()) {
      const objectNumber = object.asIndirect();
      if (reachable.has(objectNumber)) {
        continue;
      }
      reachable.add(objectNumber);
      pending.push(object.resolve());
      continue;
    }
    if (object.isArray() || object.isDictionary()) {
      object.forEach((value) => {
        pending.push(value);
      });
    }
  }

  return reachable;
}

async function countUnreachableObjects(pdf: Uint8Array): Promise<number> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const reachable = collectReachableObjectNumbers(doc.getTrailer());
  let count = 0;

  for (
    let objectNumber = 1;
    objectNumber < doc.countObjects();
    objectNumber++
  ) {
    try {
      if (
        !reachable.has(objectNumber) &&
        !doc.newIndirect(objectNumber).resolve().isNull()
      ) {
        count++;
      }
    } catch {
      continue;
    }
  }

  doc.destroy();
  return count;
}

async function retainFirstPageImageFromCatalog(
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
  doc.getTrailer().get('Root').resolve().put('RetainedImage', value);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function retainFirstPageImageFromOrphan(
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
  const orphan = doc.newDictionary();
  orphan.put('Type', doc.newName('ImageRetainingOrphan'));
  orphan.put('Image', value);
  doc.addObject(orphan);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function getRetainedImageColorSpace(pdf: Uint8Array): Promise<string> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;

  for (
    let objectNumber = 1;
    objectNumber < doc.countObjects();
    objectNumber++
  ) {
    try {
      const object = doc.newIndirect(objectNumber).resolve();
      if (object.get('Type').toString() !== '/ImageRetainingOrphan') {
        continue;
      }
      const image = doc.loadImage(object.get('Image'));
      const colorSpace = image.getColorSpace()?.getName() ?? 'Unknown';
      image.destroy();
      doc.destroy();
      return colorSpace;
    } catch {
      continue;
    }
  }

  doc.destroy();
  throw new Error('Image-retaining orphan not found');
}

async function createPdfWithSharedSoftMask(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const pageObject = page.getObject().resolve();
  const resources = pageObject.get('Resources');
  const xobjects = resources.get('XObject');
  const maskImage = new mupdf.Image(
    fs.readFileSync(path.join(fixturesDir, 'ck_gray.pgm')),
  );
  const maskRef = doc.addImage(maskImage);
  maskRef.resolve().put('ColorSpace', 'DeviceGray');
  const carrierImage = new mupdf.Image(
    fs.readFileSync(path.join(fixturesDir, 'ck_rgb.png')),
  );
  const carrierRef = doc.addImage(carrierImage);
  carrierRef.resolve().put('SMask', maskRef);
  xobjects.put('X4', maskRef);
  xobjects.put('Carrier', carrierRef);
  resources.put('XObject', xobjects);
  pageObject.put('Resources', resources);
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  carrierImage.destroy();
  maskImage.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function getSoftMaskColorSpace(pdf: Uint8Array): Promise<string> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;

  for (
    let objectNumber = 1;
    objectNumber < doc.countObjects();
    objectNumber++
  ) {
    try {
      const object = doc.newIndirect(objectNumber).resolve();
      if (object.get('Subtype').toString() !== '/Image') {
        continue;
      }
      const softMask = object.get('SMask');
      if (softMask.isNull()) {
        continue;
      }
      const image = doc.loadImage(softMask);
      const colorSpace = image.getColorSpace()?.getName() ?? 'Unknown';
      image.destroy();
      doc.destroy();
      return colorSpace;
    } catch {
      continue;
    }
  }

  doc.destroy();
  throw new Error('Soft mask not found');
}

async function referenceCatalogFromFirstPageImage(
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
  value.resolve().put('Catalog', doc.getTrailer().get('Root'));
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function getPageCount(pdf: Uint8Array): Promise<number> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const pageCount = doc.countPages();
  doc.destroy();
  return pageCount;
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

  it('removes replaced image objects that are no longer referenced', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const { pdf: destPdf } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getXrefImageColorSpaces(destPdf)).toEqual(['DeviceCMYK']);
    expect(await countUnreachableObjects(destPdf)).toBe(0);
  });

  it('preserves unrelated unreferenced objects', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const pdfWithOrphan = await addUnreferencedObject(
      srcPdf,
      'UnrelatedOrphan',
    );
    const unreachableBefore = await countUnreachableObjects(pdfWithOrphan);
    const { pdf: destPdf } = await replaceImages(pdfWithOrphan, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(unreachableBefore).toBeGreaterThan(0);
    expect(await countUnreachableObjects(destPdf)).toBe(unreachableBefore);
  });

  it('preserves replaced image objects that remain referenced', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const pdfWithRetainedImage = await retainFirstPageImageFromCatalog(srcPdf);
    const sourceColorSpaces =
      await getXrefImageColorSpaces(pdfWithRetainedImage);
    const { pdf: destPdf } = await replaceImages(pdfWithRetainedImage, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getXrefImageColorSpaces(destPdf)).toEqual([
      ...sourceColorSpaces,
      'DeviceCMYK',
    ]);
  });

  it('preserves orphan objects that reference replaced images', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const pdfWithOrphan = await retainFirstPageImageFromOrphan(srcPdf);
    const retainedColorSpaceBefore =
      await getRetainedImageColorSpace(pdfWithOrphan);
    const { pdf: destPdf } = await replaceImages(pdfWithOrphan, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getRetainedImageColorSpace(destPdf)).toBe(
      retainedColorSpaceBefore,
    );
  });

  it('preserves replaced images that remain referenced as soft masks', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const pdfWithSharedSoftMask = await createPdfWithSharedSoftMask(srcPdf);
    const { pdf: destPdf } = await replaceImages(pdfWithSharedSoftMask, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_gray.pgm'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getSoftMaskColorSpace(destPdf)).toBe('DeviceGray');
    expect(await getXrefImageColorSpaces(destPdf)).toContain('DeviceCMYK');
  });

  it('preserves objects referenced from the trailer', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const pdfWithCatalogReference =
      await referenceCatalogFromFirstPageImage(srcPdf);
    const { pdf: destPdf } = await replaceImages(pdfWithCatalogReference, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getPageCount(destPdf)).toBe(1);
    expect(await getXrefImageColorSpaces(destPdf)).toEqual(['DeviceCMYK']);
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

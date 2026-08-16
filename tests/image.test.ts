import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type {
  ImageContext,
  ReplaceFunction,
} from '../src/config/replace-image.js';
import { Logger } from '../src/logger.js';
import {
  builtinCmykConversion,
  builtinCmykReplacement,
  builtinGrayConversion,
  builtinGrayReplacement,
  findNonCmykImages,
  iccConversion,
  iccReplacement,
  replaceImages,
} from '../src/output/image.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');

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
      if (!res?.isDictionary()) {
        return 'Unknown';
      }

      const xobjects = res.get('XObject');
      if (!xobjects?.isDictionary()) {
        return 'Unknown';
      }

      let colorSpace: 'RGB' | 'CMYK' | 'Gray' | 'Unknown' = 'Unknown';

      xobjects.forEach((value) => {
        const resolved = value.resolve();
        if (resolved.get('Subtype')?.toString() !== '/Image') {
          return;
        }

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

type ColorSpaceLabel = 'RGB' | 'CMYK' | 'Gray' | 'Other';

function toColorSpaceLabel(
  cs: import('mupdf').ColorSpace | null,
): ColorSpaceLabel {
  if (cs?.isRGB()) {
    return 'RGB';
  }
  if (cs?.isCMYK()) {
    return 'CMYK';
  }
  if (cs?.isGray()) {
    return 'Gray';
  }
  return 'Other';
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
  if (found === undefined) {
    throw new Error('no image XObject found');
  }
  return found;
}

async function collectImageColorSpaces(pdf: Uint8Array): Promise<{
  page: Record<string, { colorSpace: ColorSpaceLabel; hasSMask: boolean }>;
  nested: ColorSpaceLabel[];
}> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page: Record<
    string,
    { colorSpace: ColorSpaceLabel; hasSMask: boolean }
  > = {};
  const nested: ColorSpaceLabel[] = [];
  doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject')
    .forEach((value, key) => {
      const resolved = value.resolve();
      const subtype = resolved.get('Subtype')?.toString();
      if (subtype === '/Image') {
        const smask = resolved.get('SMask');
        let colorSpace: ColorSpaceLabel = 'Other';
        try {
          colorSpace = toColorSpaceLabel(
            doc.loadImage(value).toPixmap().getColorSpace(),
          );
        } catch {
          colorSpace = 'Other';
        }
        page[String(key)] = {
          colorSpace,
          hasSMask: !!smask && !smask.isNull(),
        };
      } else if (subtype === '/Form') {
        resolved
          .get('Resources')
          .get('XObject')
          .forEach((nestedValue) => {
            if (nestedValue.resolve().get('Subtype')?.toString() === '/Image') {
              nested.push(
                toColorSpaceLabel(
                  doc.loadImage(nestedValue).toPixmap().getColorSpace(),
                ),
              );
            }
          });
      }
    });
  return { page, nested };
}

async function wrapFirstImageInForm(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { key: imageKey, value: imageRef } = findFirstImageXObject(xobjects);
  const formDict = doc.newDictionary();
  formDict.put('Type', doc.newName('XObject'));
  formDict.put('Subtype', doc.newName('Form'));
  const bbox = doc.newArray();
  for (const v of [0, 0, 1, 1]) {
    bbox.push(doc.newInteger(v));
  }
  formDict.put('BBox', bbox);
  const formXobjects = doc.newDictionary();
  formXobjects.put('NestedIm', imageRef);
  const formResources = doc.newDictionary();
  formResources.put('XObject', formXobjects);
  formDict.put('Resources', formResources);
  const content = new mupdf.Buffer();
  content.writeLine('/NestedIm Do');
  xobjects.put(imageKey, doc.addStream(content, formDict));
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function getFirstImagePixels(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  return new Uint8Array(doc.loadImage(value).toPixmap().getPixels());
}

async function attachSMaskToFirstImage(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const img = doc.loadImage(value);
  const maskPixmap = new mupdf.Pixmap(
    mupdf.ColorSpace.DeviceGray,
    [0, 0, img.getWidth(), img.getHeight()],
    false,
  );
  maskPixmap.clear(128);
  const maskRef = doc.addImage(new mupdf.Image(maskPixmap));
  value.resolve().put('SMask', maskRef);
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function getFirstImageSMaskPixel(pdf: Uint8Array): Promise<number> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const smask = value.resolve().get('SMask');
  return doc.loadImage(smask).toPixmap().getPixels()[0];
}

async function corruptFirstImageColorSpace(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  value.resolve().put('ColorSpace', doc.newName('DeviceBogus'));
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function attachCorruptSMaskToFirstImage(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  // A reference to an undefined object is not strictly dangling: PDF treats it
  // as the null object, not as an error (ISO 32000-1 §7.3.10). This test
  // relies on mupdf tolerating the reference as "no mask" while loading the
  // parent image, then throwing from the explicit loadImage call on the SMask.
  value.resolve().put('SMask', doc.newIndirect(99999));
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function duplicateFirstImageObject(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const resolved = value.resolve();
  const dict = doc.newDictionary();
  for (const name of [
    'Type',
    'Subtype',
    'Width',
    'Height',
    'ColorSpace',
    'BitsPerComponent',
    'Filter',
    'DecodeParms',
  ]) {
    const entry = resolved.get(name);
    if (entry && !entry.isNull()) {
      dict.put(name, entry);
    }
  }
  xobjects.put('ImDup', doc.addRawStream(value.readRawStream(), dict));
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function convertFirstImageToIndexed(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const resolved = value.resolve();
  const width = resolved.get('Width').asNumber();
  const height = resolved.get('Height').asNumber();
  const palette = doc.addRawStream(
    new Uint8Array([255, 0, 0, 0, 0, 255]),
    doc.newDictionary(),
  );
  const colorSpace = doc.newArray();
  for (const element of [
    doc.newName('Indexed'),
    doc.newName('DeviceRGB'),
    doc.newInteger(1),
    palette,
  ]) {
    colorSpace.push(element);
  }
  resolved.put('ColorSpace', colorSpace);
  resolved.put('BitsPerComponent', doc.newInteger(8));
  resolved.delete('Filter');
  resolved.delete('DecodeParms');
  value.writeRawStream(
    new Uint8Array(width * height).map((_, index) => index % 2),
  );
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function addOpaqueImageToFirstPage(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(255, 0, 0)';
  ctx.fillRect(0, 0, 8, 8);
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const imgRef = doc.addImage(new mupdf.Image(canvas.toBuffer('image/png')));
  doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject')
    .put('ExtraIm', imgRef);
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
}

async function wrapFirstImageInCircularForms(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const xobjects = doc
    .loadPage(0)
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { key: imageKey, value: imageRef } = findFirstImageXObject(xobjects);

  const formBDict = doc.newDictionary();
  formBDict.put('Type', doc.newName('XObject'));
  formBDict.put('Subtype', doc.newName('Form'));
  const bboxB = doc.newArray();
  for (const v of [0, 0, 1, 1]) {
    bboxB.push(doc.newInteger(v));
  }
  formBDict.put('BBox', bboxB);
  const formBRef = doc.addStream(new mupdf.Buffer(), formBDict);

  const formADict = doc.newDictionary();
  formADict.put('Type', doc.newName('XObject'));
  formADict.put('Subtype', doc.newName('Form'));
  const bboxA = doc.newArray();
  for (const v of [0, 0, 1, 1]) {
    bboxA.push(doc.newInteger(v));
  }
  formADict.put('BBox', bboxA);
  const formAXobjects = doc.newDictionary();
  formAXobjects.put('NestedIm', imageRef);
  formAXobjects.put('FormB', formBRef);
  const formAResources = doc.newDictionary();
  formAResources.put('XObject', formAXobjects);
  formADict.put('Resources', formAResources);
  const contentA = new mupdf.Buffer();
  contentA.writeLine('/NestedIm Do');
  const formARef = doc.addStream(contentA, formADict);

  const formBXobjects = doc.newDictionary();
  formBXobjects.put('FormA', formARef);
  const formBResources = doc.newDictionary();
  formBResources.put('XObject', formBXobjects);
  formBRef.resolve().put('Resources', formBResources);

  xobjects.put(imageKey, formARef);
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array());
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

  it('warns when ReplaceFunction does not return a Uint8Array', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [(() => 'not bytes') as unknown as ReplaceFunction],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('must return a Uint8Array'),
    );
    expect(await getImageColorSpace(destPdf)).toBe('RGB');
    spy.mockRestore();
  });

  it('replaces images nested in Form XObjects', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await wrapFirstImageInForm(srcPdf);

    const destPdf = await replaceImages({
      pdf: nestedPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
    });

    const { nested } = await collectImageColorSpaces(destPdf);
    expect(nested).toEqual(['CMYK']);
  });

  it('handles circular Form XObject references', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const circularPdf = await wrapFirstImageInCircularForms(srcPdf);

    const destPdf = await replaceImages({
      pdf: circularPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
    });

    const { nested } = await collectImageColorSpaces(destPdf);
    expect(nested).toEqual(['CMYK']);
  });

  it('preserves soft mask when a replacement function converts the image', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const smaskPdf = await attachSMaskToFirstImage(srcPdf);

    const spy = vi.spyOn(Logger, 'logWarn');
    const destPdf = await replaceImages({
      pdf: smaskPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(spy).not.toHaveBeenCalled();
    const { page } = await collectImageColorSpaces(destPdf);
    expect(Object.values(page)).toEqual([
      { colorSpace: 'Gray', hasSMask: true },
    ]);
    expect(await getFirstImageSMaskPixel(destPdf)).toBe(128);
    spy.mockRestore();
  });

  it('preserves soft mask when a file entry replaces the image', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const smaskPdf = await attachSMaskToFirstImage(srcPdf);

    const spy = vi.spyOn(Logger, 'logWarn');
    const destPdf = await replaceImages({
      pdf: smaskPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
    });

    expect(spy).not.toHaveBeenCalled();
    const { page } = await collectImageColorSpaces(destPdf);
    expect(Object.values(page)).toEqual([
      { colorSpace: 'CMYK', hasSMask: true },
    ]);
    expect(await getFirstImageSMaskPixel(destPdf)).toBe(128);
    spy.mockRestore();
  });

  it('skips images with /Mask when an entry matches and warns', async () => {
    const mupdf = await import('mupdf');
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const doc = mupdf.PDFDocument.openDocument(
      srcPdf,
      'application/pdf',
    ) as import('mupdf').PDFDocument;
    const xobjects = doc
      .loadPage(0)
      .getObject()
      .resolve()
      .get('Resources')
      .get('XObject');
    const { value } = findFirstImageXObject(xobjects);
    const maskArray = doc.newArray();
    for (const v of [250, 255, 250, 255, 250, 255]) {
      maskArray.push(doc.newInteger(v));
    }
    value.resolve().put('Mask', maskArray);
    const maskPdf = new Uint8Array(doc.saveToBuffer('compress').asUint8Array());

    const spy = vi.spyOn(Logger, 'logWarn');
    const destPdf = await replaceImages({
      pdf: maskPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot replace image with /Mask'),
    );
    const { page } = await collectImageColorSpaces(destPdf);
    expect(Object.values(page).map((v) => v.colorSpace)).toEqual(['RGB']);
    spy.mockRestore();

    const noMatchSpy = vi.spyOn(Logger, 'logWarn');
    await replaceImages({
      pdf: maskPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_cmyk.tiff'),
          replacement: path.join(fixturesDir, 'ck_rgb.png'),
        },
      ],
    });
    expect(noMatchSpy).not.toHaveBeenCalled();
    noMatchSpy.mockRestore();
  });

  it('warns and continues when the soft mask cannot be loaded', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const corruptPdf = await attachCorruptSMaskToFirstImage(srcPdf);
    const spy = vi.spyOn(Logger, 'logWarn');
    const debugSpy = vi.spyOn(Logger, 'debug');

    const destPdf = await replaceImages({
      pdf: corruptPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[all RGB] -> [function]'),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to replace image: ref'),
    );
    expect(destPdf).toBeInstanceOf(Uint8Array);
    debugSpy.mockRestore();
    spy.mockRestore();
  });

  it('continues replacing other images after a corrupt one', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const twoImagePdf = await addOpaqueImageToFirstPage(srcPdf);
    const corruptPdf = await corruptFirstImageColorSpace(twoImagePdf);
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: corruptPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to replace image: ref'),
    );
    const { page } = await collectImageColorSpaces(destPdf);
    expect(page.ExtraIm?.colorSpace).toBe('Gray');
    spy.mockRestore();
  });

  it('falls back to later entries when a function declines with null', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [() => null, builtinGrayReplacement()],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(await getImageColorSpace(destPdf)).toBe('Gray');
    spy.mockRestore();
  });

  it('falls back to later entries when a source entry function declines', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: () => null,
        },
        builtinGrayReplacement(),
      ],
    });

    expect(await getImageColorSpace(destPdf)).toBe('Gray');
  });

  it('leaves the image unreplaced when every entry declines', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [() => null],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(await getImageColorSpace(destPdf)).toBe('RGB');
    spy.mockRestore();
  });

  it('does not fall back to later entries when the matched entry fails', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: () => {
            throw new Error('conversion failed');
          },
        },
        builtinGrayReplacement(),
      ],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply replacement function'),
    );
    expect(await getImageColorSpace(destPdf)).toBe('RGB');
    spy.mockRestore();
  });

  it('replaces every image matching the same file entry', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const dupPdf = await duplicateFirstImageObject(srcPdf);

    const destPdf = await replaceImages({
      pdf: dupPdf,
      replaceImageConfig: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
    });

    const { page } = await collectImageColorSpaces(destPdf);
    expect(Object.keys(page)).toContain('ImDup');
    expect(Object.values(page).map((image) => image.colorSpace)).toEqual([
      'CMYK',
      'CMYK',
    ]);
  });

  it('warns and continues when an image cannot be replaced', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const corruptPdf = await corruptFirstImageColorSpace(srcPdf);
    const spy = vi.spyOn(Logger, 'logWarn');

    const destPdf = await replaceImages({
      pdf: corruptPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to replace image: ref'),
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

  it('iccReplacement converts RGB image using a CMYK ICC profile', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const cmykProfile = fs.readFileSync(path.join(fixturesDir, 'ps_cmyk.icc'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const builtinPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });
    const iccPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [iccReplacement(cmykProfile)],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(await getImageColorSpace(iccPdf)).toBe('CMYK');
    const builtinPixels = await getFirstImagePixels(builtinPdf);
    const iccPixels = await getFirstImagePixels(iccPdf);
    expect(iccPixels.length).toBe(builtinPixels.length);
    expect(
      Buffer.compare(Buffer.from(builtinPixels), Buffer.from(iccPixels)),
    ).not.toBe(0);
    spy.mockRestore();
  });

  it('iccReplacement does not affect subsequent builtin conversions', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const cmykProfile = fs.readFileSync(path.join(fixturesDir, 'ps_cmyk.icc'));

    const pdf1 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });
    await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [iccReplacement(cmykProfile)],
    });
    const pdf3 = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });

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

  it('iccReplacement converts RGB image using a Gray ICC profile', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const grayProfile = fs.readFileSync(path.join(fixturesDir, 'ps_gray.icc'));
    const spy = vi.spyOn(Logger, 'logWarn');

    const builtinPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });
    const iccPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [iccReplacement(grayProfile)],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(await getImageColorSpace(iccPdf)).toBe('Gray');
    const builtinPixels = await getFirstImagePixels(builtinPdf);
    const iccPixels = await getFirstImagePixels(iccPdf);
    expect(iccPixels.length).toBe(builtinPixels.length);
    expect(
      Buffer.compare(Buffer.from(builtinPixels), Buffer.from(iccPixels)),
    ).not.toBe(0);
    spy.mockRestore();
  });
});

function expectCmykValue(
  value: import('../src/global-viewer.js').CMYKValue | null,
): import('../src/global-viewer.js').CMYKValue {
  if (value === null) {
    throw new Error('Expected a CMYK value');
  }
  return value;
}

describe('builtinCmykConversion', () => {
  it('converts black to mostly K', async () => {
    const convert = builtinCmykConversion();
    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));
    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero CMYK', async () => {
    const convert = builtinCmykConversion();
    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );
    expect(result.c).toBeLessThan(500);
    expect(result.m).toBeLessThan(500);
    expect(result.y).toBeLessThan(500);
    expect(result.k).toBeLessThan(500);
  });
});

describe('builtinGrayConversion', () => {
  it('converts black to high K', async () => {
    const convert = builtinGrayConversion();
    const result = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));
    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeGreaterThan(5000);
  });

  it('converts white to near-zero K', async () => {
    const convert = builtinGrayConversion();
    const result = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );
    expect(result).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(result.k).toBeLessThan(500);
  });
});

describe('iccConversion', () => {
  it('converts colors through a CMYK profile', async () => {
    const profile = fs.readFileSync(path.join(fixturesDir, 'ps_cmyk.icc'));
    const convert = iccConversion(profile);
    const black = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));
    expect(black.c + black.m + black.y + black.k).toBeGreaterThan(10000);
    const white = expectCmykValue(
      await convert({ r: 10000, g: 10000, b: 10000 }),
    );
    expect(white.c).toBeLessThan(500);
    expect(white.m).toBeLessThan(500);
    expect(white.y).toBeLessThan(500);
    expect(white.k).toBeLessThan(500);
  });

  it('maps grayscale profiles to the K channel', async () => {
    const profile = fs.readFileSync(path.join(fixturesDir, 'ps_gray.icc'));
    const convert = iccConversion(profile);
    const black = expectCmykValue(await convert({ r: 0, g: 0, b: 0 }));
    expect(black).toMatchObject({ c: 0, m: 0, y: 0 });
    expect(black.k).toBeGreaterThan(5000);
  });
});

describe('findNonCmykImages', () => {
  it('reports RGB images in PDF', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const found = await findNonCmykImages(srcPdf);

    expect(found).toEqual([
      {
        key: expect.anything(),
        width: expect.any(Number),
        height: expect.any(Number),
        pageIndex: 0,
      },
    ]);
  });

  it('reports images whose color space requires decoding to inspect', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const indexedPdf = await convertFirstImageToIndexed(srcPdf);

    const found = await findNonCmykImages(indexedPdf);

    expect(found).toEqual([
      {
        key: expect.anything(),
        width: expect.any(Number),
        height: expect.any(Number),
        pageIndex: 0,
      },
    ]);
  });

  it('reports RGB images nested in Form XObjects', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await wrapFirstImageInForm(srcPdf);

    const found = await findNonCmykImages(nestedPdf);

    expect(found).toEqual([
      {
        key: 'NestedIm',
        width: expect.any(Number),
        height: expect.any(Number),
        pageIndex: 0,
      },
    ]);
  });

  it('reports images nested in circular Form XObjects', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const circularPdf = await wrapFirstImageInCircularForms(srcPdf);

    const found = await findNonCmykImages(circularPdf);

    expect(found).toEqual([
      {
        key: 'NestedIm',
        width: expect.any(Number),
        height: expect.any(Number),
        pageIndex: 0,
      },
    ]);
  });

  it('warns and continues when an image cannot be inspected', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const corruptPdf = await corruptFirstImageColorSpace(srcPdf);
    const spy = vi.spyOn(Logger, 'logWarn');

    const found = await findNonCmykImages(corruptPdf);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to inspect image'),
    );
    expect(found).toEqual([]);
    spy.mockRestore();
  });

  it('reports nothing when all images are CMYK', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const cmykPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinCmykReplacement()],
    });

    expect(await findNonCmykImages(cmykPdf)).toEqual([]);
  });

  it('reports nothing when all images are Gray', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const grayPdf = await replaceImages({
      pdf: srcPdf,
      replaceImageConfig: [builtinGrayReplacement()],
    });

    expect(await findNonCmykImages(grayPdf)).toEqual([]);
  });

  it('reports nothing for PDF with no images', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    expect(await findNonCmykImages(srcPdf)).toEqual([]);
  });
});

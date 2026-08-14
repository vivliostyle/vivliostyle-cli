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
  page: Record<string, ColorSpaceLabel>;
  nested: ColorSpaceLabel[];
}> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page: Record<string, ColorSpaceLabel> = {};
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
        page[String(key)] = toColorSpaceLabel(
          doc.loadImage(value).toPixmap().getColorSpace(),
        );
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
});

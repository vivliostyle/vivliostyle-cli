import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { CmykConfig } from '../src/config/resolve.js';
import { Logger } from '../src/logger.js';
import { createCmykColorHook } from '../src/output/cmyk.js';
import { createReplaceImageHook } from '../src/output/image.js';
import { editPdf } from '../src/output/pdf-visitor.js';

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'cmyk');
const signal = AbortSignal.any([]);
const unassociatedAlphaJp2 = path.join(fixturesDir, 'alpha-unassociated.jp2');
const premultipliedAlphaJp2 = path.join(fixturesDir, 'alpha-premultiplied.jp2');
const opaqueAlphaPng = path.join(fixturesDir, 'alpha-opaque.png');
const transparentRgbPng = path.join(fixturesDir, 'transparent-rgb.png');
const transparentGrayPng = path.join(fixturesDir, 'transparent-gray.png');
const chromiumTransparentRgb = new Uint8Array([
  1, 2, 3, 187, 33, 91, 77, 88, 99,
]);
const chromiumTransparentAlpha = new Uint8Array([128, 176, 0]);

function writeTemporaryImage(extension: string, bytes: Uint8Array): string {
  const temporaryDir = path.join(import.meta.dirname, '..', '.tmp');
  const imagePath = path.join(
    temporaryDir,
    `replace-image-${randomUUID()}.${extension}`,
  );
  fs.mkdirSync(temporaryDir, { recursive: true });
  fs.writeFileSync(imagePath, bytes);
  return imagePath;
}

function changeJp2ChannelDefinition(
  bytes: Uint8Array,
  definitionIndex: number,
  type: number,
  association: number,
  occurrence = 0,
): Uint8Array {
  const result = new Uint8Array(bytes);
  const buffer = Buffer.from(result);
  let channelDefinitionTypeOffset = -1;
  for (let index = 0; index <= occurrence; index++) {
    channelDefinitionTypeOffset = buffer.indexOf(
      'cdef',
      channelDefinitionTypeOffset + 1,
    );
  }
  if (channelDefinitionTypeOffset === -1) {
    throw new Error('JP2 channel definition box not found');
  }
  const definitionOffset =
    channelDefinitionTypeOffset + 4 + 2 + definitionIndex * 6;
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );
  view.setUint16(definitionOffset + 2, type);
  view.setUint16(definitionOffset + 4, association);
  return result;
}

function insertTopLevelJp2ChannelDefinition(bytes: Uint8Array): Uint8Array {
  const buffer = Buffer.from(bytes);
  const channelDefinitionTypeOffset = buffer.indexOf('cdef');
  const headerTypeOffset = buffer.indexOf('jp2h');
  if (channelDefinitionTypeOffset < 4 || headerTypeOffset < 4) {
    throw new Error('Required JP2 boxes not found');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channelDefinitionStart = channelDefinitionTypeOffset - 4;
  const channelDefinitionLength = view.getUint32(channelDefinitionStart);
  const headerStart = headerTypeOffset - 4;
  return new Uint8Array(
    Buffer.concat([
      buffer.subarray(0, headerStart),
      buffer.subarray(
        channelDefinitionStart,
        channelDefinitionStart + channelDefinitionLength,
      ),
      buffer.subarray(headerStart),
    ]),
  );
}

async function replaceImages(
  pdf: Uint8Array,
  options: {
    replacements: Parameters<typeof createReplaceImageHook>[0];
    ifIncompatibleImagesFound: CmykConfig['ifIncompatibleImagesFound'];
  },
) {
  const warnings: string[] = [];
  const warning = vi.spyOn(Logger, 'logWarn').mockImplementation((message) => {
    if (
      typeof message === 'string' &&
      message.startsWith('Image color space is incompatible')
    ) {
      warnings.push(message);
    }
  });
  const failures: string[] = [];
  try {
    using replaceImageHook = await createReplaceImageHook(
      options.replacements,
      options.ifIncompatibleImagesFound,
      failures,
    );
    const result = await editPdf(pdf, [replaceImageHook], { signal });
    return { pdf: result, warnings, failures };
  } finally {
    warning.mockRestore();
  }
}

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
      imageColorSpace?.destroy();
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
      const imageColorSpace = image.getColorSpace();
      colorSpaces.push(imageColorSpace?.getName() ?? 'Unknown');
      imageColorSpace?.destroy();
      image.destroy();
    } catch {
      continue;
    }
  }

  doc.destroy();
  return colorSpaces;
}

async function getFirstPageImageStreamState(pdf: Uint8Array): Promise<{
  filter: string;
  hasSoftMask: boolean;
  smaskInData: number | null;
  bytes: Uint8Array;
}> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const imageObject = value.resolve();
  const data = value.readRawStream();
  const smaskInData = imageObject.get('SMaskInData');
  const state = {
    filter: imageObject.get('Filter').toString(),
    hasSoftMask: !imageObject.get('SMask').isNull(),
    smaskInData: smaskInData.isNumber() ? smaskInData.asNumber() : null,
    bytes: new Uint8Array(data.asUint8Array()),
  };
  data.destroy();
  page.destroy();
  doc.destroy();
  return state;
}

async function getFirstPageImagePixels(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const image = doc.loadImage(value);
  const pixmap = image.toPixmap();
  const pixels = new Uint8Array(pixmap.getPixels());
  pixmap.destroy();
  image.destroy();
  page.destroy();
  doc.destroy();
  return pixels;
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
      const imageColorSpace = image.getColorSpace();
      const colorSpace = imageColorSpace?.getName() ?? 'Unknown';
      imageColorSpace?.destroy();
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

async function replaceFirstPageImage(
  pdf: Uint8Array,
  width: number,
  height: number,
  rgb: Uint8Array,
  alpha: Uint8Array | null,
  maskDimensions: readonly [number, number] = [width, height],
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { key } = findFirstImageXObject(xobjects);
  const createImageDictionary = (
    colorSpace: string,
    imageWidth = width,
    imageHeight = height,
  ) => {
    const dictionary = doc.newDictionary();
    dictionary.put('Type', doc.newName('XObject'));
    dictionary.put('Subtype', doc.newName('Image'));
    dictionary.put('Width', doc.newInteger(imageWidth));
    dictionary.put('Height', doc.newInteger(imageHeight));
    dictionary.put('ColorSpace', doc.newName(colorSpace));
    dictionary.put('BitsPerComponent', doc.newInteger(8));
    return dictionary;
  };
  const imageDictionary = createImageDictionary('DeviceRGB');
  if (alpha !== null) {
    imageDictionary.put(
      'SMask',
      doc.addRawStream(
        alpha,
        createImageDictionary(
          'DeviceGray',
          maskDimensions[0],
          maskDimensions[1],
        ),
      ),
    );
  }
  xobjects.put(key, doc.addRawStream(rgb, imageDictionary));
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function getFirstPageImageTransparencyState(pdf: Uint8Array): Promise<{
  softMaskObjectNumber: number | null;
  softMaskOpaque: boolean | null;
  softMaskDimensions: readonly [number, number] | null;
  smaskInData: number | null;
}> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { value } = findFirstImageXObject(xobjects);
  const imageObject = value.resolve();
  const softMask = imageObject.get('SMask');
  const smaskInData = imageObject.get('SMaskInData');
  let softMaskOpaque: boolean | null = null;
  if (!softMask.isNull()) {
    const maskImage = doc.loadImage(softMask);
    const maskPixmap = maskImage.toPixmap();
    const pixels = maskPixmap.getPixels();
    const stride = maskPixmap.getStride();
    const components = maskPixmap.getNumberOfComponents();
    softMaskOpaque = true;
    for (let y = 0; y < maskPixmap.getHeight(); y++) {
      for (let x = 0; x < maskPixmap.getWidth(); x++) {
        if (pixels[y * stride + x * components] !== 255) {
          softMaskOpaque = false;
        }
      }
    }
    maskPixmap.destroy();
    maskImage.destroy();
  }
  const softMaskObject = softMask.isNull() ? null : softMask.resolve();
  const state = {
    softMaskObjectNumber: softMask.isIndirect() ? softMask.asIndirect() : null,
    softMaskOpaque,
    softMaskDimensions: softMaskObject?.isDictionary()
      ? ([
          softMaskObject.get('Width').asNumber(),
          softMaskObject.get('Height').asNumber(),
        ] as const)
      : null,
    smaskInData: smaskInData.isNumber() ? smaskInData.asNumber() : null,
  };
  page.destroy();
  doc.destroy();
  return state;
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
      const imageColorSpace = image.getColorSpace();
      const colorSpace = imageColorSpace?.getName() ?? 'Unknown';
      imageColorSpace?.destroy();
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

async function duplicateFirstImageObject(pdf: Uint8Array): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
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
  const buffer = value.readRawStream();
  xobjects.put('ImDup', doc.addRawStream(buffer, dict));
  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  buffer.destroy();
  page.destroy();
  doc.destroy();
  return result;
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

function createFormXObject(
  doc: import('mupdf').PDFDocument,
  xobjects: import('mupdf').PDFObject,
  content: string,
): import('mupdf').PDFObject {
  const resources = doc.newDictionary();
  resources.put('XObject', xobjects);
  return createFormXObjectWithResources(doc, resources, content);
}

function createFormXObjectWithResources(
  doc: import('mupdf').PDFDocument,
  resources: import('mupdf').PDFObject,
  content: string,
): import('mupdf').PDFObject {
  const dictionary = doc.newDictionary();
  dictionary.put('Type', doc.newName('XObject'));
  dictionary.put('Subtype', doc.newName('Form'));
  const bbox = doc.newArray();
  for (const value of [0, 0, 1, 1]) {
    bbox.push(doc.newInteger(value));
  }
  dictionary.put('BBox', bbox);
  dictionary.put('Resources', resources);
  return doc.addStream(content, dictionary);
}

async function nestFirstImageInForms(
  pdf: Uint8Array,
  circular = false,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const xobjects = page.getObject().resolve().get('Resources').get('XObject');
  const { key, value: image } = findFirstImageXObject(xobjects);

  const innerXObjects = doc.newDictionary();
  innerXObjects.put('NestedImage', image);
  const inner = createFormXObject(
    doc,
    innerXObjects,
    '1 0 0 rg /NestedImage Do',
  );

  const outerXObjects = doc.newDictionary();
  outerXObjects.put('InnerForm', inner);
  const outer = createFormXObject(doc, outerXObjects, '/InnerForm Do');
  if (circular) {
    innerXObjects.put('OuterForm', outer);
  }
  xobjects.put(key, outer);

  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function shareResourcesBetweenForms(
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const pageXObjects = page
    .getObject()
    .resolve()
    .get('Resources')
    .get('XObject');
  const { key, value: image } = findFirstImageXObject(pageXObjects);
  const sharedXObjects = doc.newDictionary();
  sharedXObjects.put('SharedImage', image);
  const sharedResources = doc.newDictionary();
  sharedResources.put('XObject', sharedXObjects);
  const sharedResourcesReference = doc.addObject(sharedResources);
  const firstForm = createFormXObjectWithResources(
    doc,
    sharedResourcesReference,
    '/SharedImage Do',
  );
  const secondForm = createFormXObjectWithResources(
    doc,
    sharedResourcesReference,
    '/SharedImage Do',
  );
  pageXObjects.put(key, firstForm);
  pageXObjects.put('SharedForm', secondForm);

  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function shareResourcesBetweenPages(
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
  const sharedResources = resources.asIndirect()
    ? resources
    : doc.addObject(resources);
  pageObject.put('Resources', sharedResources);
  const secondPage = doc.addPage(page.getBounds(), 0, sharedResources, '');
  doc.insertPage(-1, secondPage);

  const output = doc.saveToBuffer('compress');
  const result = new Uint8Array(output.asUint8Array());
  output.destroy();
  page.destroy();
  doc.destroy();
  return result;
}

async function inspectNestedForms(pdf: Uint8Array): Promise<{
  colorSpaces: string[];
  contents: string[];
}> {
  const mupdf = await import('mupdf');
  const doc = mupdf.PDFDocument.openDocument(
    pdf,
    'application/pdf',
  ) as import('mupdf').PDFDocument;
  const page = doc.loadPage(0);
  const processedForms = new Set<number>();
  const colorSpaces: string[] = [];
  const contents: string[] = [];

  const inspectResources = (resources: import('mupdf').PDFObject): void => {
    const xobjects = resources.get('XObject');
    if (!xobjects?.isDictionary()) {
      return;
    }
    xobjects.forEach((value) => {
      const subtype = value.get('Subtype')?.toString();
      if (subtype === '/Image') {
        const image = doc.loadImage(value);
        const imageColorSpace = image.getColorSpace();
        colorSpaces.push(imageColorSpace?.getName() ?? 'Unknown');
        imageColorSpace?.destroy();
        image.destroy();
        return;
      }
      if (subtype !== '/Form') {
        return;
      }
      const objectNumber = value.asIndirect();
      if (objectNumber && processedForms.has(objectNumber)) {
        return;
      }
      if (objectNumber) {
        processedForms.add(objectNumber);
      }
      const content = value.readStream();
      contents.push(content.asString());
      content.destroy();
      const nestedResources = value.get('Resources');
      if (nestedResources?.isDictionary()) {
        inspectResources(nestedResources);
      }
    });
  };

  inspectResources(page.getObject().resolve().get('Resources'));
  page.destroy();
  doc.destroy();
  return { colorSpaces, contents };
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
      const { pdf: destPdf, warnings } = await replaceImages(srcPdf, {
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
      expect(warnings).toHaveLength(incompatibleCount);
    },
  );

  it('preserves an ICCBased replacement color space', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const { pdf: destPdf, warnings } = await replaceImages(srcPdf, {
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
    expect(warnings).toEqual([expect.stringContaining('(ICCBased')]);
  });

  it('replaces images when the incompatible image policy is ignore', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const { pdf: destPdf, warnings } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceCMYK',
      image: 'DeviceCMYK',
    });
    expect(warnings).toEqual([]);
  });

  it('uses the first matching replacement', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const { pdf: destPdf } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceGray',
      image: 'DeviceGray',
    });
  });

  it('reuses a loaded replacement image across matching XObjects', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const duplicatePdf = await duplicateFirstImageObject(srcPdf);

    const { pdf: destPdf } = await replaceImages(duplicatePdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getXrefImageColorSpaces(destPdf)).toEqual(['DeviceGray']);
  });

  it('does not match a transparent source when mask dimensions differ', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const maskedPdf = await replaceFirstPageImage(
      srcPdf,
      3,
      1,
      chromiumTransparentRgb,
      new Uint8Array([128]),
      [1, 1],
    );
    const { pdf: destPdf } = await replaceImages(maskedPdf, {
      replacements: [
        {
          source: transparentRgbPng,
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });
    expect(await getFirstPageImageTransparencyState(destPdf)).toMatchObject({
      softMaskObjectNumber: expect.any(Number),
      softMaskDimensions: [1, 1],
    });
    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceRGB',
      image: 'DeviceRGB',
    });
  });

  it('matches a semi-transparent RGB source using its soft mask', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const maskedPdf = await replaceFirstPageImage(
      srcPdf,
      3,
      1,
      chromiumTransparentRgb,
      chromiumTransparentAlpha,
    );
    const unreachableBefore = await countUnreachableObjects(maskedPdf);
    const { pdf: destPdf } = await replaceImages(maskedPdf, {
      replacements: [
        {
          source: transparentRgbPng,
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });
    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceGray',
      image: 'DeviceGray',
    });
    expect(await getFirstPageImageTransparencyState(destPdf)).toMatchObject({
      softMaskObjectNumber: null,
      softMaskDimensions: null,
      smaskInData: null,
    });
    expect(await countUnreachableObjects(destPdf)).toBe(unreachableBefore);
  });

  it('does not match a semi-transparent source when its soft mask differs', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const maskedPdf = await replaceFirstPageImage(
      srcPdf,
      3,
      1,
      new Uint8Array([1, 2, 3, 187, 33, 91, 77, 88, 99]),
      new Uint8Array([128, 175, 0]),
    );
    const { pdf: destPdf } = await replaceImages(maskedPdf, {
      replacements: [
        {
          source: transparentRgbPng,
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceRGB',
      image: 'DeviceRGB',
    });
  });

  it('does not match a semi-transparent source when visible color differs', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const maskedPdf = await replaceFirstPageImage(
      srcPdf,
      3,
      1,
      new Uint8Array([1, 2, 3, 186, 33, 91, 77, 88, 99]),
      new Uint8Array([128, 176, 0]),
    );
    const { pdf: destPdf } = await replaceImages(maskedPdf, {
      replacements: [
        {
          source: transparentRgbPng,
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceRGB',
      image: 'DeviceRGB',
    });
  });

  it('matches an opaque RGBA source without a soft mask', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const opaquePdf = await replaceFirstPageImage(
      srcPdf,
      2,
      1,
      new Uint8Array([128, 64, 32, 128, 64, 32]),
      null,
    );
    const { pdf: destPdf } = await replaceImages(opaquePdf, {
      replacements: [
        {
          source: opaqueAlphaPng,
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceGray',
      image: 'DeviceGray',
    });
  });

  it('matches a semi-transparent grayscale source expanded to RGB', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const maskedPdf = await replaceFirstPageImage(
      srcPdf,
      2,
      1,
      new Uint8Array([200, 200, 200, 50, 50, 50]),
      new Uint8Array([128, 255]),
    );
    const unreachableBefore = await countUnreachableObjects(maskedPdf);
    const { pdf: destPdf } = await replaceImages(maskedPdf, {
      replacements: [
        {
          source: transparentGrayPng,
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getImageColorSpace(destPdf)).toEqual({
      object: '/DeviceGray',
      image: 'DeviceGray',
    });
    expect(await getFirstPageImageTransparencyState(destPdf)).toMatchObject({
      softMaskObjectNumber: null,
      softMaskDimensions: null,
      smaskInData: null,
    });
    expect(await countUnreachableObjects(destPdf)).toBe(unreachableBefore);
  });
  it('preserves unassociated alpha embedded in a JPX replacement', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = new Uint8Array(
      fs.readFileSync(unassociatedAlphaJp2),
    );

    const { pdf: destPdf } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: unassociatedAlphaJp2,
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getFirstPageImageStreamState(destPdf)).toEqual({
      filter: '/JPXDecode',
      hasSoftMask: false,
      smaskInData: 1,
      bytes: replacementBytes,
    });
    expect(await getFirstPageImagePixels(destPdf)).toEqual(
      new Uint8Array([127, 0, 0, 127, 127, 0, 0, 127]),
    );
    expect(await countUnreachableObjects(destPdf)).toBe(0);
  });

  it('preserves premultiplied alpha embedded in a JPX replacement', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = new Uint8Array(
      fs.readFileSync(premultipliedAlphaJp2),
    );

    const { pdf: destPdf } = await replaceImages(srcPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: premultipliedAlphaJp2,
        },
      ],
      ifIncompatibleImagesFound: 'ignore',
    });

    expect(await getFirstPageImageStreamState(destPdf)).toEqual({
      filter: '/JPXDecode',
      hasSoftMask: false,
      smaskInData: 2,
      bytes: replacementBytes,
    });
    expect(await getFirstPageImagePixels(destPdf)).toEqual(
      new Uint8Array([64, 0, 0, 128, 64, 0, 0, 128]),
    );
    expect(await countUnreachableObjects(destPdf)).toBe(0);
  });

  it('does not treat an unspecified JPX auxiliary channel as alpha', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = changeJp2ChannelDefinition(
      fs.readFileSync(unassociatedAlphaJp2),
      3,
      0xffff,
      0xffff,
    );
    const replacement = writeTemporaryImage('jp2', replacementBytes);

    try {
      const { pdf: destPdf } = await replaceImages(srcPdf, {
        replacements: [
          {
            source: path.join(fixturesDir, 'ck_rgb.png'),
            replacement,
          },
        ],
        ifIncompatibleImagesFound: 'ignore',
      });

      expect(await getFirstPageImageStreamState(destPdf)).toEqual({
        filter: '/JPXDecode',
        hasSoftMask: false,
        smaskInData: null,
        bytes: replacementBytes,
      });
    } finally {
      fs.rmSync(replacement, { force: true });
    }
  });

  it('rejects JPX alpha that does not apply to every color channel', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = changeJp2ChannelDefinition(
      fs.readFileSync(unassociatedAlphaJp2),
      3,
      1,
      1,
    );
    const replacement = writeTemporaryImage('jp2', replacementBytes);

    try {
      await expect(
        replaceImages(srcPdf, {
          replacements: [
            {
              source: path.join(fixturesDir, 'ck_rgb.png'),
              replacement,
            },
          ],
          ifIncompatibleImagesFound: 'ignore',
        }),
      ).rejects.toThrow(
        'JPX replacement alpha must use one opacity channel that applies to all color channels',
      );
    } finally {
      fs.rmSync(replacement, { force: true });
    }
  });

  it('rejects JPX replacements with multiple opacity channels', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = changeJp2ChannelDefinition(
      fs.readFileSync(unassociatedAlphaJp2),
      2,
      1,
      0,
    );
    const replacement = writeTemporaryImage('jp2', replacementBytes);

    try {
      await expect(
        replaceImages(srcPdf, {
          replacements: [
            {
              source: path.join(fixturesDir, 'ck_rgb.png'),
              replacement,
            },
          ],
          ifIncompatibleImagesFound: 'ignore',
        }),
      ).rejects.toThrow(
        'JPX replacement alpha must use one opacity channel that applies to all color channels',
      );
    } finally {
      fs.rmSync(replacement, { force: true });
    }
  });

  it('ignores a channel definition outside the JP2 header box', async () => {
    const srcPdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const replacementBytes = changeJp2ChannelDefinition(
      insertTopLevelJp2ChannelDefinition(fs.readFileSync(unassociatedAlphaJp2)),
      3,
      0xffff,
      0xffff,
      1,
    );
    const replacement = writeTemporaryImage('jp2', replacementBytes);

    try {
      const { pdf: destPdf } = await replaceImages(srcPdf, {
        replacements: [
          {
            source: path.join(fixturesDir, 'ck_rgb.png'),
            replacement,
          },
        ],
        ifIncompatibleImagesFound: 'ignore',
      });

      expect(await getFirstPageImageStreamState(destPdf)).toEqual({
        filter: '/JPXDecode',
        hasSoftMask: false,
        smaskInData: null,
        bytes: replacementBytes,
      });
    } finally {
      fs.rmSync(replacement, { force: true });
    }
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

    expect(result).toEqual({ pdf: srcPdf, warnings: [], failures: [] });
  });

  it('returns an empty hook when no replacement functions can be prepared and the policy is ignore', async () => {
    const warning = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});

    try {
      using hook = await createReplaceImageHook(
        [
          {
            source: path.join(fixturesDir, 'missing-source.png'),
            replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
          },
        ],
        'ignore',
        [],
      );

      expect(hook.visit).toBeUndefined();
      expect(hook.complete).toBeUndefined();
    } finally {
      warning.mockRestore();
    }
  });

  it('reports incompatible images when replacements are empty', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));

    const result = await replaceImages(pdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.pdf).toEqual(pdf);
    expect(result.warnings).toEqual([
      expect.stringMatching(
        /^Image color space is incompatible with Device CMYK: ref ".+" \(.+, \d+x\d+\) on page 1$/v,
      ),
    ]);
  });

  it('reports indexed RGB images', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const indexedPdf = await convertFirstImageToIndexed(pdf);

    const result = await replaceImages(indexedPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.warnings).toHaveLength(1);
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

    expect(result.warnings).toHaveLength(1);
    expect(result.failures).toEqual([
      '1 image(s) incompatible with Device CMYK color',
    ]);
  });

  it('accepts PDFs without images', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'text.pdf'));

    const result = await replaceImages(pdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.warnings).toEqual([]);
  });

  it('replaces and validates images nested in Form XObjects', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await nestFirstImageInForms(pdf);

    const result = await replaceImages(nestedPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect((await inspectNestedForms(result.pdf)).colorSpaces).toEqual([
      'DeviceCMYK',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('reports unmatched images nested in Form XObjects', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await nestFirstImageInForms(pdf);

    const result = await replaceImages(nestedPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.pdf).toEqual(nestedPdf);
    expect(result.warnings).toEqual([
      expect.stringMatching(/\(.*RGB.*, \d+x\d+\) on page 1$/v),
    ]);
  });

  it('handles circular Form XObject references', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const circularPdf = await nestFirstImageInForms(pdf, true);

    const result = await replaceImages(circularPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect((await inspectNestedForms(result.pdf)).colorSpaces).toEqual([
      'DeviceCMYK',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('processes shared XObject dictionaries once', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const sharedResourcesPdf = await shareResourcesBetweenForms(pdf);

    const result = await replaceImages(sharedResourcesPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
        {
          source: path.join(fixturesDir, 'ck_gray.pgm'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect((await inspectNestedForms(result.pdf)).colorSpaces).toEqual([
      'DeviceGray',
      'DeviceGray',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('reports shared XObject dictionaries on each page', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const sharedResourcesPdf = await shareResourcesBetweenPages(pdf);

    const result = await replaceImages(sharedResourcesPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.warnings).toEqual([
      expect.stringMatching(/on page 1$/v),
      expect.stringMatching(/on page 2$/v),
    ]);
  });

  it('reports images in shared Form resources on each page', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await nestFirstImageInForms(pdf);
    const sharedResourcesPdf = await shareResourcesBetweenPages(nestedPdf);

    const result = await replaceImages(sharedResourcesPdf, {
      replacements: [],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(result.warnings).toEqual([
      expect.stringMatching(/on page 1$/v),
      expect.stringMatching(/on page 2$/v),
    ]);
  });

  it('does not replace shared XObject dictionaries again on later pages', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const sharedResourcesPdf = await shareResourcesBetweenPages(pdf);

    const result = await replaceImages(sharedResourcesPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
        {
          source: path.join(fixturesDir, 'ck_gray.pgm'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect(await getImageColorSpace(result.pdf)).toEqual({
      object: '/DeviceGray',
      image: 'DeviceGray',
    });
  });

  it('does not replace images in shared Forms again on later pages', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await nestFirstImageInForms(pdf);
    const sharedResourcesPdf = await shareResourcesBetweenPages(nestedPdf);

    const result = await replaceImages(sharedResourcesPdf, {
      replacements: [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_gray.pgm'),
        },
        {
          source: path.join(fixturesDir, 'ck_gray.pgm'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      ifIncompatibleImagesFound: 'warn',
    });

    expect((await inspectNestedForms(result.pdf)).colorSpaces).toEqual([
      'DeviceGray',
    ]);
  });
});

describe('PDF edit hooks', () => {
  it('edits colors and images during the same Form traversal', async () => {
    const pdf = fs.readFileSync(path.join(fixturesDir, 'image.pdf'));
    const nestedPdf = await nestFirstImageInForms(pdf);
    const cmykColorHook = createCmykColorHook(
      new Map([['[10000,0,0]', { c: 0, m: 10000, y: 10000, k: 0 }]]),
      'ignore',
      [],
    );
    const failures: string[] = [];
    using replaceImageHook = await createReplaceImageHook(
      [
        {
          source: path.join(fixturesDir, 'ck_rgb.png'),
          replacement: path.join(fixturesDir, 'ck_cmyk.tiff'),
        },
      ],
      'error',
      failures,
    );
    const result = await editPdf(nestedPdf, [cmykColorHook, replaceImageHook], {
      signal,
    });
    const inspected = await inspectNestedForms(result);

    expect(inspected.colorSpaces).toEqual(['DeviceCMYK']);
    expect(inspected.contents).toContain('0 1 1 0 k /NestedImage Do');
    expect(failures).toEqual([]);
  });
});

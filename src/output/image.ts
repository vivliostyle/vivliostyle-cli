import fs from 'node:fs';

import type * as mupdfType from 'mupdf';

import type { CmykConfig, ReplaceImageConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';

interface Destroyable {
  destroy(): void;
}

function disposable<T extends Destroyable>(obj: T): T & Disposable {
  return Object.assign(obj, {
    [Symbol.dispose]() {
      obj.destroy();
    },
  });
}

function imagesEqual(a: mupdfType.Image, b: mupdfType.Image): boolean {
  if (a.getWidth() !== b.getWidth() || a.getHeight() !== b.getHeight()) {
    return false;
  }

  const pixmapA = a.toPixmap();
  const pixmapB = b.toPixmap();

  const typeA = pixmapA.getColorSpace();
  const typeB = pixmapB.getColorSpace();
  if (
    typeA === null ||
    typeB === null ||
    !(
      (typeA.isRGB() && typeB.isRGB()) ||
      (typeA.isCMYK() && typeB.isCMYK()) ||
      (typeA.isGray() && typeB.isGray())
    )
  ) {
    return false;
  }

  const pixelsA = pixmapA.getPixels();
  const pixelsB = pixmapB.getPixels();
  return (
    pixelsA.length === pixelsB.length &&
    Buffer.compare(Buffer.from(pixelsA), Buffer.from(pixelsB)) === 0
  );
}

interface ImagePair {
  srcImage: mupdfType.Image;
  destImage: mupdfType.Image;
  sourcePath: string;
  replacementPath: string;
}

interface ReplaceStats {
  replaced: number;
  total: number;
}

export interface DeviceCmykIncompatibleImage {
  key: string | number;
  colorSpace: string;
  width: number;
  height: number;
  pageIndex: number;
}

function collectDeviceCmykIncompatibleImage(
  image: mupdfType.Image,
  key: string | number,
  pageIndex: number,
  found: DeviceCmykIncompatibleImage[],
): void {
  const colorSpace = image.getColorSpace()?.getName() ?? 'None';
  if (
    image.getImageMask() ||
    colorSpace === 'DeviceCMYK' ||
    colorSpace === 'DeviceGray'
  ) {
    return;
  }
  found.push({
    key,
    colorSpace,
    width: image.getWidth(),
    height: image.getHeight(),
    pageIndex,
  });
}

function addImagePreservingColorSpace(
  doc: mupdfType.PDFDocument,
  image: mupdfType.Image,
): mupdfType.PDFObject {
  const ref = doc.addImage(image);
  const colorSpaceName = image.getColorSpace()?.getName();

  if (
    colorSpaceName === 'DeviceGray' ||
    colorSpaceName === 'DeviceCMYK' ||
    // This intentionally differs from Chromium/Skia, which attaches a Skia ICC profile even to unprofiled images.
    // Preserving DeviceRGB here is the only way to represent an unprofiled RGB replacement as such.
    colorSpaceName === 'DeviceRGB'
  ) {
    ref.resolve().put('ColorSpace', colorSpaceName);
  }

  return ref;
}

function replaceImagesInDocument(
  doc: mupdfType.PDFDocument,
  imagePairs: ImagePair[],
  incompatibleImages: DeviceCmykIncompatibleImage[] | null,
): ReplaceStats {
  let replaced = 0;
  let total = 0;

  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pageObj = page.getObject().resolve();

    const res = pageObj.get('Resources');
    if (!res || !res.isDictionary()) {
      continue;
    }

    const xobjects = res.get('XObject');
    if (!xobjects || !xobjects.isDictionary()) {
      continue;
    }

    // Collect keys first to avoid modification during iteration
    const entries: { key: string | number; value: mupdfType.PDFObject }[] = [];
    xobjects.forEach((value, key) => {
      entries.push({ key, value });
    });

    for (const { key, value } of entries) {
      const resolved = value.resolve();
      const subtype = resolved.get('Subtype');

      if (!subtype || subtype.toString() !== '/Image') {
        continue;
      }
      total++;

      // Extract image from PDF
      using pdfImage = disposable(doc.loadImage(value));
      let replacementRef: mupdfType.PDFObject | undefined;

      // Find matching source image
      for (const pair of imagePairs) {
        if (imagesEqual(pdfImage, pair.srcImage)) {
          replacementRef = addImagePreservingColorSpace(doc, pair.destImage);
          xobjects.put(key, replacementRef);
          replaced++;
          Logger.debug(
            `  Page ${i + 1}, ref "${key}": ${pair.sourcePath} -> ${pair.replacementPath}`,
          );
          break;
        }
      }

      if (incompatibleImages) {
        if (replacementRef) {
          using replacementImage = disposable(doc.loadImage(replacementRef));
          collectDeviceCmykIncompatibleImage(
            replacementImage,
            key,
            i,
            incompatibleImages,
          );
        } else {
          collectDeviceCmykIncompatibleImage(
            pdfImage,
            key,
            i,
            incompatibleImages,
          );
        }
      }
    }

    res.put('XObject', xobjects);
    pageObj.put('Resources', res);
  }

  return { replaced, total };
}

export async function replaceImages(
  pdf: Uint8Array,
  {
    replacements,
    ifIncompatibleImagesFound,
  }: {
    replacements: ReplaceImageConfig;
    ifIncompatibleImagesFound: CmykConfig['ifIncompatibleImagesFound'];
  },
): Promise<{
  pdf: Uint8Array;
  incompatibleImages: DeviceCmykIncompatibleImage[];
}> {
  if (replacements.length === 0 && ifIncompatibleImagesFound === 'ignore') {
    return { pdf, incompatibleImages: [] };
  }

  const mupdf = await importNodeModule('mupdf');

  // Load image pairs
  const imagePairs: ImagePair[] = [];
  for (const { source, replacement } of replacements) {
    let srcImage: mupdfType.Image;
    let destImage: mupdfType.Image;

    try {
      const srcBuffer = fs.readFileSync(source);
      srcImage = new mupdf.Image(srcBuffer);
      Logger.debug(
        `Loaded source image: ${source} (${srcImage.getWidth()}x${srcImage.getHeight()})`,
      );
    } catch (error) {
      Logger.logWarn(
        `Failed to load source image: ${source}: ${String(error)}`,
      );
      continue;
    }

    try {
      const destBuffer = fs.readFileSync(replacement);
      destImage = new mupdf.Image(destBuffer);
      Logger.debug(
        `Loaded replacement image: ${replacement} (${destImage.getWidth()}x${destImage.getHeight()})`,
      );
    } catch (error) {
      Logger.logWarn(
        `Failed to load replacement image: ${replacement}: ${String(error)}`,
      );
      continue;
    }

    imagePairs.push({
      srcImage,
      destImage,
      sourcePath: source,
      replacementPath: replacement,
    });
  }

  if (imagePairs.length === 0 && ifIncompatibleImagesFound === 'ignore') {
    return { pdf, incompatibleImages: [] };
  }

  using doc = disposable(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- openDocument returns the Document base type; a PDF input yields a PDFDocument
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );

  const incompatibleImages: DeviceCmykIncompatibleImage[] = [];
  const stats = replaceImagesInDocument(
    doc,
    imagePairs,
    ifIncompatibleImagesFound === 'ignore' ? null : incompatibleImages,
  );
  Logger.debug(`Replaced ${stats.replaced} of ${stats.total} images`);

  if (imagePairs.length === 0) {
    return { pdf, incompatibleImages };
  }

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return {
    pdf: new Uint8Array(outputBuffer.asUint8Array()),
    incompatibleImages,
  };
}

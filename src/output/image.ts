import fs from 'node:fs';
import type * as mupdfType from 'mupdf';
import type { ReplaceImageConfig } from '../config/resolve.js';
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

function replaceImagesInDocument(
  doc: mupdfType.PDFDocument,
  imagePairs: ImagePair[],
): ReplaceStats {
  let replaced = 0;
  let total = 0;

  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pageObj = page.getObject().resolve();

    const res = pageObj.get('Resources');
    if (!res || !res.isDictionary()) continue;

    const xobjects = res.get('XObject');
    if (!xobjects || !xobjects.isDictionary()) continue;

    // Collect keys first to avoid modification during iteration
    const entries: { key: string | number; value: mupdfType.PDFObject }[] = [];
    xobjects.forEach((value, key) => {
      entries.push({ key, value });
    });

    for (const { key, value } of entries) {
      const resolved = value.resolve();
      const subtype = resolved.get('Subtype');

      if (subtype && subtype.toString() === '/Image') {
        total++;

        // Extract image from PDF
        const pdfImage = doc.loadImage(value);

        // Find matching source image
        for (const pair of imagePairs) {
          if (imagesEqual(pdfImage, pair.srcImage)) {
            const newImageRef = doc.addImage(pair.destImage);
            xobjects.put(key, newImageRef);
            replaced++;
            Logger.debug(
              `  Page ${i + 1}, ref "${key}": ${pair.sourcePath} -> ${pair.replacementPath}`,
            );
            break;
          }
        }
      }
    }

    res.put('XObject', xobjects);
    pageObj.put('Resources', res);
  }

  return { replaced, total };
}

export async function replaceImages({
  pdf,
  replaceImageConfig,
}: {
  pdf: Uint8Array;
  replaceImageConfig: ReplaceImageConfig;
}): Promise<Uint8Array> {
  if (replaceImageConfig.length === 0) {
    return pdf;
  }

  const mupdf = await importNodeModule('mupdf');

  // Load image pairs
  const imagePairs: ImagePair[] = [];
  for (const { source, replacement } of replaceImageConfig) {
    let srcImage: mupdfType.Image;
    let destImage: mupdfType.Image;

    try {
      const srcBuffer = fs.readFileSync(source);
      srcImage = new mupdf.Image(srcBuffer);
      Logger.debug(
        `Loaded source image: ${source} (${srcImage.getWidth()}x${srcImage.getHeight()})`,
      );
    } catch (error) {
      Logger.logWarn(`Failed to load source image: ${source}: ${error}`);
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
        `Failed to load replacement image: ${replacement}: ${error}`,
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

  if (imagePairs.length === 0) {
    return pdf;
  }

  using doc = disposable(
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );

  const stats = replaceImagesInDocument(doc, imagePairs);
  Logger.debug(`Replaced ${stats.replaced} of ${stats.total} images`);

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

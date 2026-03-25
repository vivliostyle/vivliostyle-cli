import fs from 'node:fs';
import type * as mupdfType from 'mupdf';
import type {
  ImageContext,
  ReplaceFunction,
  ReplaceImageConfig,
} from '../config/resolve.js';
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

function createImageContext(pdfImage: mupdfType.Image): ImageContext {
  return {
    asPNG() {
      return pdfImage.toPixmap().asPNG();
    },
  };
}

function isRgbImage(pdfImage: mupdfType.Image): boolean {
  const cs = pdfImage.toPixmap().getColorSpace();
  return cs?.isRGB() ?? false;
}

// A prepared entry is a function that attempts to match and replace a PDF image.
// Returns the replacement Image on match, or null to try the next entry.
type PreparedEntry = (
  pdfImage: mupdfType.Image,
  pageIndex: number,
  key: string | number,
) => Promise<mupdfType.Image | null>;

function prepareFileEntry(
  srcImage: mupdfType.Image,
  destImage: mupdfType.Image,
  sourcePath: string,
  replacementPath: string,
): PreparedEntry {
  return async (pdfImage, pageIndex, key) => {
    if (!imagesEqual(pdfImage, srcImage)) return null;
    Logger.debug(
      `  Page ${pageIndex + 1}, ref "${key}": ${sourcePath} -> ${replacementPath}`,
    );
    return destImage;
  };
}

function prepareFnWithSourceEntry(
  srcImage: mupdfType.Image,
  sourcePath: string,
  fn: ReplaceFunction,
  mupdf: typeof import('mupdf'),
): PreparedEntry {
  // Chromium converts all images to RGB in its PDF output
  // (even grayscale PNGs are embedded as RGB).
  // Only pass RGB images to ReplaceFunction.
  return async (pdfImage, pageIndex, key) => {
    if (!isRgbImage(pdfImage)) return null;
    if (!imagesEqual(pdfImage, srcImage)) return null;
    const resultBytes = await fn(createImageContext(pdfImage));
    Logger.debug(
      `  Page ${pageIndex + 1}, ref "${key}": ${sourcePath} -> [function]`,
    );
    return new mupdf.Image(resultBytes);
  };
}

function prepareBareFnEntry(
  fn: ReplaceFunction,
  mupdf: typeof import('mupdf'),
): PreparedEntry {
  // Chromium converts all images to RGB in its PDF output
  // (even grayscale PNGs are embedded as RGB).
  // Only pass RGB images to ReplaceFunction.
  return async (pdfImage, pageIndex, key) => {
    if (!isRgbImage(pdfImage)) return null;
    const resultBytes = await fn(createImageContext(pdfImage));
    Logger.debug(
      `  Page ${pageIndex + 1}, ref "${key}": [all RGB] -> [function]`,
    );
    return new mupdf.Image(resultBytes);
  };
}

interface ReplaceStats {
  replaced: number;
  total: number;
}

async function replaceImagesInDocument(
  doc: mupdfType.PDFDocument,
  preparedEntries: PreparedEntry[],
): Promise<ReplaceStats> {
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

        const pdfImage = doc.loadImage(value);
        for (const entry of preparedEntries) {
          const result = await entry(pdfImage, i, key);
          if (result) {
            const newImageRef = doc.addImage(result);
            xobjects.put(key, newImageRef);
            replaced++;
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

  // Prepare entries: each config item becomes a match-and-replace function
  const preparedEntries: PreparedEntry[] = [];
  for (const item of replaceImageConfig) {
    if (typeof item === 'function') {
      preparedEntries.push(prepareBareFnEntry(item, mupdf));
      continue;
    }

    const { source, replacement } = item;

    let srcImage: mupdfType.Image;
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

    if (typeof replacement === 'function') {
      preparedEntries.push(
        prepareFnWithSourceEntry(srcImage, source, replacement, mupdf),
      );
      continue;
    }

    let destImage: mupdfType.Image;
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

    preparedEntries.push(
      prepareFileEntry(srcImage, destImage, source, replacement),
    );
  }

  if (preparedEntries.length === 0) {
    return pdf;
  }

  using doc = disposable(
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );

  const stats = await replaceImagesInDocument(doc, preparedEntries);
  Logger.debug(`Replaced ${stats.replaced} of ${stats.total} images`);

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

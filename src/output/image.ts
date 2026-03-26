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

type DisposableImage = mupdfType.Image & Disposable;

function imagesEqual(a: mupdfType.Image, b: mupdfType.Image): boolean {
  if (a.getWidth() !== b.getWidth() || a.getHeight() !== b.getHeight()) {
    return false;
  }

  using pixmapA = disposable(a.toPixmap());
  using pixmapB = disposable(b.toPixmap());

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
      using pixmap = disposable(pdfImage.toPixmap());
      return pixmap.asPNG();
    },
  };
}

function isRgbImage(pdfImage: mupdfType.Image): boolean {
  using pixmap = disposable(pdfImage.toPixmap());
  const cs = pixmap.getColorSpace();
  return cs?.isRGB() ?? false;
}

function convertImageColorSpace(
  image: mupdfType.Image,
  colorSpace: mupdfType.ColorSpace,
  mupdf: typeof import('mupdf'),
): DisposableImage {
  using pixmap = disposable(image.toPixmap());
  using converted = disposable(pixmap.convertToColorSpace(colorSpace));
  return disposable(new mupdf.Image(converted));
}

function resolveColorSpace(
  type: 'CMYK' | 'Gray',
  mupdf: typeof import('mupdf'),
  inputProfile?: Uint8Array,
  outputProfile?: Uint8Array,
): { colorSpace: mupdfType.ColorSpace; useICC: boolean } {
  if (outputProfile) {
    return {
      colorSpace: new mupdf.ColorSpace(outputProfile, `custom-${type}`),
      useICC: true,
    };
  }
  // inputProfile without outputProfile: enable ICC engine with device color space
  if (inputProfile) {
    return {
      colorSpace:
        type === 'CMYK'
          ? mupdf.ColorSpace.DeviceCMYK
          : mupdf.ColorSpace.DeviceGray,
      useICC: true,
    };
  }
  return {
    colorSpace:
      type === 'CMYK'
        ? mupdf.ColorSpace.DeviceCMYK
        : mupdf.ColorSpace.DeviceGray,
    useICC: false,
  };
}

function createBuiltinReplacement(
  type: 'CMYK' | 'Gray',
  inputProfile?: Uint8Array,
  outputProfile?: Uint8Array,
): ReplaceFunction {
  const fn: ReplaceFunction = async (image) => {
    const mupdf = await importNodeModule('mupdf');
    const { colorSpace, useICC } = resolveColorSpace(
      type,
      mupdf,
      inputProfile,
      outputProfile,
    );
    if (useICC) mupdf.enableICC();
    try {
      using img = disposable(new mupdf.Image(image.asPNG()));
      using result = convertImageColorSpace(img, colorSpace, mupdf);
      using pixmap = disposable(result.toPixmap());
      return pixmap.asPAM();
    } finally {
      if (useICC) mupdf.disableICC();
    }
  };
  // Tag for fast-path detection
  (fn as any).__builtinType = type;
  (fn as any).__inputProfile = inputProfile;
  (fn as any).__outputProfile = outputProfile;
  return fn;
}

/**
 * Returns a ReplaceFunction that converts RGB images to CMYK.
 * When called without arguments, uses mupdf's DeviceCMYK color space.
 * ICC profiles can be provided for more accurate conversion.
 *
 * @param inputProfile - ICC profile for interpreting the source RGB image
 * @param outputProfile - ICC profile for the target CMYK color space
 */
export function builtinCmykReplacement(
  inputProfile?: Uint8Array,
  outputProfile?: Uint8Array,
): ReplaceFunction {
  return createBuiltinReplacement('CMYK', inputProfile, outputProfile);
}

/**
 * Returns a ReplaceFunction that converts RGB images to grayscale.
 * When called without arguments, uses mupdf's DeviceGray color space.
 * ICC profiles can be provided for more accurate conversion.
 *
 * @param inputProfile - ICC profile for interpreting the source RGB image
 * @param outputProfile - ICC profile for the target Gray color space
 */
export function builtinGrayReplacement(
  inputProfile?: Uint8Array,
  outputProfile?: Uint8Array,
): ReplaceFunction {
  return createBuiltinReplacement('Gray', inputProfile, outputProfile);
}

/**
 * Scan PDF for images with non-CMYK-compatible color spaces and log warnings.
 */
export async function findNonCmykImages(pdf: Uint8Array): Promise<void> {
  const mupdf = await importNodeModule('mupdf');
  using doc = disposable(
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as import('mupdf').PDFDocument,
  );

  const warned = new Set<string>();
  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
    const pageObj = page.getObject().resolve();
    const res = pageObj.get('Resources');
    if (!res?.isDictionary()) continue;
    const xobjects = res.get('XObject');
    if (!xobjects?.isDictionary()) continue;

    xobjects.forEach((value) => {
      const resolved = value.resolve();
      if (resolved.get('Subtype')?.toString() !== '/Image') return;

      using img = disposable(doc.loadImage(value));
      using pixmap = disposable(img.toPixmap());
      const cs = pixmap.getColorSpace();
      if (cs && !cs.isCMYK() && !cs.isGray()) {
        const warnKey = `${img.getWidth()}x${img.getHeight()} on page ${i + 1}`;
        if (!warned.has(warnKey)) {
          warned.add(warnKey);
          Logger.logWarn(`Non-CMYK image remaining in PDF: ${warnKey}`);
        }
      }
    });
  }
}

function applyReplaceFunction(
  fn: ReplaceFunction,
  pdfImage: mupdfType.Image,
  mupdf: typeof import('mupdf'),
): Promise<DisposableImage> | DisposableImage {
  const builtinType = (fn as any).__builtinType as 'CMYK' | 'Gray' | undefined;
  if (builtinType) {
    // Fast path for builtin replacements: direct pixmap conversion
    const inputProfile = (fn as any).__inputProfile as Uint8Array | undefined;
    const outputProfile = (fn as any).__outputProfile as Uint8Array | undefined;
    const { colorSpace, useICC } = resolveColorSpace(
      builtinType,
      mupdf,
      inputProfile,
      outputProfile,
    );
    if (useICC) mupdf.enableICC();
    try {
      return convertImageColorSpace(pdfImage, colorSpace, mupdf);
    } finally {
      if (useICC) mupdf.disableICC();
    }
  }
  // General path: bytes in, bytes out
  return (async () => {
    const resultBytes = await fn(createImageContext(pdfImage));
    return disposable(new mupdf.Image(resultBytes));
  })();
}

// A prepared entry is a function that attempts to match and replace a PDF image.
// Returns the replacement DisposableImage on match, or null to try the next entry.
type PreparedEntry = (
  pdfImage: mupdfType.Image,
  pageIndex: number,
  key: string | number,
) => Promise<DisposableImage | null>;

function prepareFileEntry(
  srcImage: mupdfType.Image,
  destImage: DisposableImage,
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
    try {
      const newImage = await applyReplaceFunction(fn, pdfImage, mupdf);
      Logger.debug(
        `  Page ${pageIndex + 1}, ref "${key}": ${sourcePath} -> [function]`,
      );
      return newImage;
    } catch (error) {
      Logger.logWarn(
        `Failed to apply replacement function for ${sourcePath} on page ${pageIndex + 1}: ${error}`,
      );
      return null;
    }
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
    try {
      const newImage = await applyReplaceFunction(fn, pdfImage, mupdf);
      Logger.debug(
        `  Page ${pageIndex + 1}, ref "${key}": [all RGB] -> [function]`,
      );
      return newImage;
    } catch (error) {
      Logger.logWarn(
        `Failed to apply replacement function on page ${pageIndex + 1}: ${error}`,
      );
      return null;
    }
  };
}

interface ReplaceStats {
  replaced: number;
  total: number;
}

async function replaceImagesInDocument(
  doc: mupdfType.PDFDocument,
  preparedEntries: PreparedEntry[],
  disposables: Set<Disposable>,
): Promise<ReplaceStats> {
  let replaced = 0;
  let total = 0;

  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
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

        const pdfImage = disposable(doc.loadImage(value));
        disposables.add(pdfImage);
        for (const entry of preparedEntries) {
          const result = await entry(pdfImage, i, key);
          if (result) {
            disposables.add(result);
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
  const disposables = new Set<Disposable>();

  try {
    // Prepare entries: each config item becomes a match-and-replace function
    const preparedEntries: PreparedEntry[] = [];
    for (const item of replaceImageConfig) {
      if (typeof item === 'function') {
        preparedEntries.push(prepareBareFnEntry(item, mupdf));
        continue;
      }

      const { source, replacement } = item;

      let srcImage: DisposableImage;
      try {
        const srcBuffer = fs.readFileSync(source);
        srcImage = disposable(new mupdf.Image(srcBuffer));
        disposables.add(srcImage);
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

      let destImage: DisposableImage;
      try {
        const destBuffer = fs.readFileSync(replacement);
        destImage = disposable(new mupdf.Image(destBuffer));
        disposables.add(destImage);
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

    const stats = await replaceImagesInDocument(
      doc,
      preparedEntries,
      disposables,
    );
    Logger.debug(`Replaced ${stats.replaced} of ${stats.total} images`);

    using outputBuffer = disposable(doc.saveToBuffer('compress'));
    // Create a copy to ensure the data remains valid after the buffer is destroyed
    return new Uint8Array(outputBuffer.asUint8Array());
  } finally {
    for (const d of disposables) {
      d[Symbol.dispose]();
    }
  }
}

import fs from 'node:fs';

import type * as mupdfType from 'mupdf';

import type {
  ImageContext,
  ReplaceFunction,
  ReplaceImageConfig,
} from '../config/replace-image.js';
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

function pixmapEqualsImage(
  pdfPixmap: mupdfType.Pixmap,
  srcImage: mupdfType.Image,
): boolean {
  if (
    pdfPixmap.getWidth() !== srcImage.getWidth() ||
    pdfPixmap.getHeight() !== srcImage.getHeight()
  ) {
    return false;
  }

  using srcPixmap = disposable(srcImage.toPixmap());

  const typeA = pdfPixmap.getColorSpace();
  const typeB = srcPixmap.getColorSpace();
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

  const pixelsA = pdfPixmap.getPixels();
  const pixelsB = srcPixmap.getPixels();
  return (
    pixelsA.length === pixelsB.length &&
    Buffer.compare(Buffer.from(pixelsA), Buffer.from(pixelsB)) === 0
  );
}

function createImageContext(pdfPixmap: mupdfType.Pixmap): ImageContext {
  return {
    asPNG() {
      return pdfPixmap.asPNG();
    },
  };
}

// Chromium converts all images to RGB in its PDF output (even grayscale PNGs
// are embedded as RGB), so replacement functions only receive RGB images.
function isRgbPixmap(pdfPixmap: mupdfType.Pixmap): boolean {
  const cs = pdfPixmap.getColorSpace();
  return cs?.isRGB() ?? false;
}

function convertPixmapColorSpace(
  pixmap: mupdfType.Pixmap,
  colorSpace: mupdfType.ColorSpace,
  mupdf: typeof import('mupdf'),
): DisposableImage {
  using converted = disposable(pixmap.convertToColorSpace(colorSpace));
  return disposable(new mupdf.Image(converted));
}

/* oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-return, typescript/strict-void-return, no-underscore-dangle -- mupdf's raw emscripten module is untyped and exposes its exports as _wasm_* functions */
// Conversions with user-supplied ICC profiles run on a separate WASM instance
// so that ICC state derived from those profiles stays isolated by construction
// from the instance that processes the document PDF.
let iccWasmInstance: Promise<any> | null = null;

function getIccWasmInstance(): Promise<any> {
  iccWasmInstance ??= (async () => {
    const wasmUrl = new URL('./mupdf-wasm.js', import.meta.resolve('mupdf'))
      .href;
    const factory = (await import(/* @vite-ignore */ wasmUrl)).default;
    const lib = await factory();
    lib._wasm_init_context();
    lib._wasm_enable_icc();
    return lib;
  })().catch((error: unknown) => {
    iccWasmInstance = null;
    throw error;
  });
  return iccWasmInstance;
}

async function convertWithICC(
  pngBytes: Uint8Array,
  outputProfile: Uint8Array,
): Promise<Uint8Array> {
  const lib: any = await getIccWasmInstance();

  function wasmDisposable(
    ptr: number,
    drop: (ptr: number) => void,
  ): Disposable & { ptr: number } {
    return {
      ptr,
      [Symbol.dispose]() {
        drop(ptr);
      },
    };
  }

  function toHeap(data: Uint8Array): number {
    const ptr: number = lib._wasm_malloc(data.length);
    lib.HEAPU8.set(data, ptr);
    return ptr;
  }

  using imgBuf = wasmDisposable(
    lib._wasm_new_buffer_from_data(toHeap(pngBytes), pngBytes.length),
    (p: number) => lib._wasm_drop_buffer(p),
  );
  using img = wasmDisposable(
    lib._wasm_new_image_from_buffer(imgBuf.ptr),
    (p: number) => lib._wasm_drop_image(p),
  );
  using pixmap = wasmDisposable(
    lib._wasm_get_pixmap_from_image(img.ptr),
    (p: number) => lib._wasm_drop_pixmap(p),
  );

  using profileBuf = wasmDisposable(
    lib._wasm_new_buffer_from_data(toHeap(outputProfile), outputProfile.length),
    (p: number) => lib._wasm_drop_buffer(p),
  );
  using namePtr = wasmDisposable(
    toHeap(new TextEncoder().encode('output-profile\0')),
    (p: number) => lib._wasm_free(p),
  );
  using targetCs = wasmDisposable(
    lib._wasm_new_icc_colorspace(namePtr.ptr, profileBuf.ptr),
    (p: number) => lib._wasm_drop_colorspace(p),
  );

  using converted = wasmDisposable(
    lib._wasm_convert_pixmap(pixmap.ptr, targetCs.ptr, 0),
    (p: number) => lib._wasm_drop_pixmap(p),
  );
  using pamBuf = wasmDisposable(
    lib._wasm_new_buffer_from_pixmap_as_pam(converted.ptr),
    (p: number) => lib._wasm_drop_buffer(p),
  );
  const pamDataPtr: number = lib._wasm_buffer_get_data(pamBuf.ptr);
  const pamLen: number = lib._wasm_buffer_get_len(pamBuf.ptr);
  return new Uint8Array(lib.HEAPU8.buffer, pamDataPtr, pamLen).slice();
}
/* oxlint-enable */

const BUILTIN_TYPE = Symbol.for('vivliostyle.builtinReplacementType');

function getBuiltinType(fn: ReplaceFunction): 'CMYK' | 'Gray' | undefined {
  if (BUILTIN_TYPE in fn) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- read the symbol tag that createBuiltinReplacement defines on the function object
    const value = (fn as Record<symbol, unknown>)[BUILTIN_TYPE];
    if (value === 'CMYK' || value === 'Gray') {
      return value;
    }
  }
  return undefined;
}

function createBuiltinReplacement(type: 'CMYK' | 'Gray'): ReplaceFunction {
  const fn: ReplaceFunction = async (image) => {
    const mupdf = await importNodeModule('mupdf');
    using img = disposable(new mupdf.Image(image.asPNG()));
    using pixmap = disposable(img.toPixmap());
    using converted = disposable(
      pixmap.convertToColorSpace(
        type === 'CMYK'
          ? mupdf.ColorSpace.DeviceCMYK
          : mupdf.ColorSpace.DeviceGray,
      ),
    );
    return converted.asPAM();
  };
  Object.defineProperty(fn, BUILTIN_TYPE, { value: type });
  return fn;
}

/**
 * Returns a ReplaceFunction that converts RGB images to CMYK
 * using mupdf's DeviceCMYK color space.
 */
export function builtinCmykReplacement(): ReplaceFunction {
  return createBuiltinReplacement('CMYK');
}

/**
 * Returns a ReplaceFunction that converts RGB images to grayscale
 * using mupdf's DeviceGray color space.
 */
export function builtinGrayReplacement(): ReplaceFunction {
  return createBuiltinReplacement('Gray');
}

/**
 * Returns a ReplaceFunction that converts RGB images to the color space
 * of the given ICC profile. The profile alone determines the output color
 * space; the profile data is passed to mupdf without inspection.
 * The conversion applies to pixel values only. The replaced image is stored
 * with mupdf's default profile for the resulting color space, not with the
 * given profile.
 */
export function iccReplacement(outputProfile: Uint8Array): ReplaceFunction {
  return (image) => convertWithICC(image.asPNG(), outputProfile);
}

export interface NonCmykImage {
  key: string | number;
  width: number;
  height: number;
  pageIndex: number;
}

/**
 * Scan PDF for images with non-CMYK-compatible color spaces.
 */
export async function findNonCmykImages(
  pdf: Uint8Array,
): Promise<NonCmykImage[]> {
  const mupdf = await importNodeModule('mupdf');
  using doc = disposable(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- openDocument returns the Document base type; a PDF input yields a PDFDocument
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as import('mupdf').PDFDocument,
  );

  const found: NonCmykImage[] = [];
  const checkedImages = new Set<string>();
  const processedForms = new Set<number>();
  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
    const pageObj = page.getObject().resolve();
    const res = pageObj.get('Resources');
    if (!res?.isDictionary()) {
      continue;
    }
    findNonCmykImagesInResources(
      doc,
      res,
      i,
      processedForms,
      checkedImages,
      found,
    );
  }
  return found;
}

function findNonCmykImagesInResources(
  doc: mupdfType.PDFDocument,
  resources: mupdfType.PDFObject,
  pageIndex: number,
  processedForms: Set<number>,
  checkedImages: Set<string>,
  found: NonCmykImage[],
): void {
  const xobjects = resources.get('XObject');
  if (!xobjects?.isDictionary()) {
    return;
  }

  xobjects.forEach((value, key) => {
    const resolved = value.resolve();
    const subtype = resolved.get('Subtype');

    if (subtype && subtype.toString() === '/Form') {
      const objNum = value.asIndirect();
      if (objNum && processedForms.has(objNum)) {
        return;
      }
      if (objNum) {
        processedForms.add(objNum);
      }
      const nestedResources = resolved.get('Resources');
      if (nestedResources && nestedResources.isDictionary()) {
        findNonCmykImagesInResources(
          doc,
          nestedResources,
          pageIndex,
          processedForms,
          checkedImages,
          found,
        );
      }
      return;
    }

    if (!subtype || subtype.toString() !== '/Image') {
      return;
    }

    const objNum = value.asIndirect();
    const imageId = objNum ? `#${objNum}` : `${pageIndex}/${String(key)}`;
    if (checkedImages.has(imageId)) {
      return;
    }
    checkedImages.add(imageId);

    try {
      using img = disposable(doc.loadImage(value));
      const imageCs = img.getColorSpace();
      if (imageCs?.isCMYK() || imageCs?.isGray()) {
        return;
      }
      if (imageCs?.isRGB()) {
        found.push({
          key,
          width: img.getWidth(),
          height: img.getHeight(),
          pageIndex,
        });
        return;
      }
      using pixmap = disposable(img.toPixmap());
      const cs = pixmap.getColorSpace();
      if (cs && !cs.isCMYK() && !cs.isGray()) {
        found.push({
          key,
          width: img.getWidth(),
          height: img.getHeight(),
          pageIndex,
        });
      }
    } catch (error) {
      Logger.logWarn(
        `Failed to inspect image: ref "${key}" on page ${pageIndex + 1}: ${String(error)}`,
      );
    }
  });
}

function applyReplaceFunction(
  fn: ReplaceFunction,
  pdfPixmap: mupdfType.Pixmap,
  mupdf: typeof import('mupdf'),
): Promise<DisposableImage> | DisposableImage {
  const builtinType = getBuiltinType(fn);
  if (builtinType) {
    return convertPixmapColorSpace(
      pdfPixmap,
      builtinType === 'CMYK'
        ? mupdf.ColorSpace.DeviceCMYK
        : mupdf.ColorSpace.DeviceGray,
      mupdf,
    );
  }
  return (async () => {
    const resultBytes = await fn(createImageContext(pdfPixmap));
    if (!(resultBytes instanceof Uint8Array)) {
      throw new Error('ReplaceFunction must return a Uint8Array');
    }
    return disposable(new mupdf.Image(resultBytes));
  })();
}

interface PreparedEntry {
  matches(pdfPixmap: mupdfType.Pixmap): boolean;
  replace(
    pdfPixmap: mupdfType.Pixmap,
    pageIndex: number,
    key: string | number,
  ): Promise<DisposableImage | null>;
}

function prepareFileEntry(
  srcImage: mupdfType.Image,
  destImage: DisposableImage,
  sourcePath: string,
  replacementPath: string,
): PreparedEntry {
  return {
    matches: (pdfPixmap) => pixmapEqualsImage(pdfPixmap, srcImage),
    replace: (_pdfPixmap, pageIndex, key) => {
      Logger.debug(
        `  Page ${pageIndex + 1}, ref "${key}": ${sourcePath} -> ${replacementPath}`,
      );
      return Promise.resolve(destImage);
    },
  };
}

function prepareFnWithSourceEntry(
  srcImage: mupdfType.Image,
  sourcePath: string,
  fn: ReplaceFunction,
  mupdf: typeof import('mupdf'),
): PreparedEntry {
  return {
    matches: (pdfPixmap) =>
      isRgbPixmap(pdfPixmap) && pixmapEqualsImage(pdfPixmap, srcImage),
    replace: async (pdfPixmap, pageIndex, key) => {
      try {
        const newImage = await applyReplaceFunction(fn, pdfPixmap, mupdf);
        Logger.debug(
          `  Page ${pageIndex + 1}, ref "${key}": ${sourcePath} -> [function]`,
        );
        return newImage;
      } catch (error) {
        Logger.logWarn(
          `Failed to apply replacement function for ${sourcePath} on page ${pageIndex + 1}: ${String(error)}`,
        );
        return null;
      }
    },
  };
}

function prepareBareFnEntry(
  fn: ReplaceFunction,
  mupdf: typeof import('mupdf'),
): PreparedEntry {
  return {
    matches: (pdfPixmap) => isRgbPixmap(pdfPixmap),
    replace: async (pdfPixmap, pageIndex, key) => {
      try {
        const newImage = await applyReplaceFunction(fn, pdfPixmap, mupdf);
        Logger.debug(
          `  Page ${pageIndex + 1}, ref "${key}": [all RGB] -> [function]`,
        );
        return newImage;
      } catch (error) {
        Logger.logWarn(
          `Failed to apply replacement function on page ${pageIndex + 1}: ${String(error)}`,
        );
        return null;
      }
    },
  };
}

interface ReplaceStats {
  replaced: number;
  total: number;
}

interface ReplaceState {
  mupdf: typeof import('mupdf');
  processedForms: Set<number>;
  replacementRefs: Map<number, mupdfType.PDFObject | null>;
  disposables: Set<Disposable>;
  stats: ReplaceStats;
}

function releaseUnlessShared(
  image: DisposableImage,
  disposables: Set<Disposable>,
): void {
  if (!disposables.has(image)) {
    image[Symbol.dispose]();
  }
}

async function replaceSingleImage(
  doc: mupdfType.PDFDocument,
  value: mupdfType.PDFObject,
  resolved: mupdfType.PDFObject,
  key: string | number,
  pageIndex: number,
  preparedEntries: PreparedEntry[],
  state: ReplaceState,
): Promise<mupdfType.PDFObject | null> {
  using pdfImage = disposable(doc.loadImage(value));
  using pdfPixmap = disposable(pdfImage.toPixmap());
  const entry = preparedEntries.find((e) => e.matches(pdfPixmap));
  if (!entry) {
    return null;
  }
  // A color-key /Mask defines its masked color ranges against the original
  // image's sample values (ISO 32000-1 §8.9.6.4), so replacing the samples
  // would invalidate the mask.
  const mask = resolved.get('Mask');
  if (mask && !mask.isNull()) {
    Logger.logWarn(
      `Cannot replace image with /Mask: ref "${key}" on page ${pageIndex + 1}`,
    );
    return null;
  }
  let result = await entry.replace(pdfPixmap, pageIndex, key);
  if (!result) {
    return null;
  }
  try {
    // PDFDocument.addImage does not carry the original object's /SMask over to
    // a pixmap-derived image, so the soft mask is recomposed onto the
    // replacement with new Image(pixmap, mask).
    const smask = resolved.get('SMask');
    if (smask && !smask.isNull()) {
      using maskImage = disposable(doc.loadImage(smask));
      using resultPixmap = disposable(result.toPixmap());
      const masked = disposable(new state.mupdf.Image(resultPixmap, maskImage));
      releaseUnlessShared(result, state.disposables);
      result = masked;
    }
    return doc.addImage(result);
  } finally {
    releaseUnlessShared(result, state.disposables);
  }
}

async function replaceImagesInResources(
  doc: mupdfType.PDFDocument,
  resources: mupdfType.PDFObject,
  preparedEntries: PreparedEntry[],
  pageIndex: number,
  state: ReplaceState,
): Promise<void> {
  const xobjects = resources.get('XObject');
  if (!xobjects || !xobjects.isDictionary()) {
    return;
  }

  // Collect keys first to avoid modification during iteration
  const entries: { key: string | number; value: mupdfType.PDFObject }[] = [];
  xobjects.forEach((value, key) => {
    entries.push({ key, value });
  });

  for (const { key, value } of entries) {
    const resolved = value.resolve();
    const subtype = resolved.get('Subtype');

    if (subtype && subtype.toString() === '/Form') {
      const objNum = value.asIndirect();
      if (objNum && state.processedForms.has(objNum)) {
        continue;
      }
      if (objNum) {
        state.processedForms.add(objNum);
      }
      const nestedResources = resolved.get('Resources');
      if (nestedResources && nestedResources.isDictionary()) {
        await replaceImagesInResources(
          doc,
          nestedResources,
          preparedEntries,
          pageIndex,
          state,
        );
      }
      continue;
    }

    if (!subtype || subtype.toString() !== '/Image') {
      continue;
    }

    const objNum = value.asIndirect();
    const memoized = objNum ? state.replacementRefs.get(objNum) : undefined;
    if (memoized !== undefined) {
      if (memoized) {
        xobjects.put(key, memoized);
      }
      continue;
    }
    state.stats.total++;

    let newRef: mupdfType.PDFObject | null = null;
    try {
      newRef = await replaceSingleImage(
        doc,
        value,
        resolved,
        key,
        pageIndex,
        preparedEntries,
        state,
      );
      if (newRef) {
        xobjects.put(key, newRef);
        state.stats.replaced++;
        const newObjNum = newRef.asIndirect();
        if (newObjNum) {
          state.replacementRefs.set(newObjNum, null);
        }
      }
    } catch (error) {
      Logger.logWarn(
        `Failed to replace image: ref "${key}" on page ${pageIndex + 1}: ${String(error)}`,
      );
    }
    if (objNum) {
      state.replacementRefs.set(objNum, newRef);
    }
  }

  resources.put('XObject', xobjects);
}

async function replaceImagesInDocument(
  doc: mupdfType.PDFDocument,
  preparedEntries: PreparedEntry[],
  disposables: Set<Disposable>,
  mupdf: typeof import('mupdf'),
): Promise<ReplaceStats> {
  const state: ReplaceState = {
    mupdf,
    processedForms: new Set(),
    replacementRefs: new Map(),
    disposables,
    stats: { replaced: 0, total: 0 },
  };
  const pageCount = doc.countPages();

  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
    const pageObj = page.getObject().resolve();

    const res = pageObj.get('Resources');
    if (!res || !res.isDictionary()) {
      continue;
    }

    await replaceImagesInResources(doc, res, preparedEntries, i, state);
    pageObj.put('Resources', res);
  }

  return state.stats;
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
        Logger.logWarn(
          `Failed to load source image: ${source}: ${String(error)}`,
        );
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
          `Failed to load replacement image: ${replacement}: ${String(error)}`,
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- openDocument returns the Document base type; a PDF input yields a PDFDocument
      mupdf.PDFDocument.openDocument(
        pdf,
        'application/pdf',
      ) as mupdfType.PDFDocument,
    );

    const stats = await replaceImagesInDocument(
      doc,
      preparedEntries,
      disposables,
      mupdf,
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

import fs from 'node:fs';

import type * as mupdfType from 'mupdf';

import type { CmykConfig, ReplaceImageConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';
import type { PdfEditHook, PdfImageXObjectNode } from './pdf-visitor.js';

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

function disposableOrNull<T extends Destroyable>(
  obj: T | null,
): (T & Disposable) | null {
  return obj && disposable(obj);
}

function imagesEqual(a: mupdfType.Image, b: mupdfType.Image): boolean {
  if (a.getWidth() !== b.getWidth() || a.getHeight() !== b.getHeight()) {
    return false;
  }

  using pixmapA = disposable(a.toPixmap());
  using pixmapB = disposable(b.toPixmap());

  using colorSpaceA = disposableOrNull(pixmapA.getColorSpace());
  using colorSpaceB = disposableOrNull(pixmapB.getColorSpace());
  if (
    colorSpaceA === null ||
    colorSpaceB === null ||
    !(
      (colorSpaceA.isRGB() && colorSpaceB.isRGB()) ||
      (colorSpaceA.isCMYK() && colorSpaceB.isCMYK()) ||
      (colorSpaceA.isGray() && colorSpaceB.isGray())
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

interface ReplaceContext {
  image: mupdfType.Image;
}

interface Replacement {
  image: mupdfType.Image;
  sourceLabel: string;
  replacementLabel: string;
}

type ReplaceFn = (
  context: ReplaceContext,
) => Replacement | null | Promise<Replacement | null>;

function disposeImages(
  images: readonly (mupdfType.Image & Disposable)[],
): void {
  for (const image of images) {
    image[Symbol.dispose]();
  }
}

async function createReplaceFn(replacements: ReplaceImageConfig): Promise<{
  replaceFn: ReplaceFn | null;
  loadedImages: (mupdfType.Image & Disposable)[];
}> {
  if (replacements.length === 0) {
    return {
      replaceFn: null,
      loadedImages: [],
    };
  }
  const mupdf = await importNodeModule('mupdf');
  const replaceFns: ReplaceFn[] = [];
  const loadedImages: (mupdfType.Image & Disposable)[] = [];
  try {
    for (const { source, replacement } of replacements) {
      let sourceImage: mupdfType.Image & Disposable;
      let replacementImage: (mupdfType.Image & Disposable) | undefined;

      try {
        const srcBuffer = fs.readFileSync(source);
        sourceImage = disposable(new mupdf.Image(srcBuffer));
        Logger.debug(
          `Loaded source image: ${source} (${sourceImage.getWidth()}x${sourceImage.getHeight()})`,
        );
      } catch (error) {
        Logger.logWarn(
          `Failed to load source image: ${source}: ${String(error)}`,
        );
        continue;
      }

      try {
        const replacementBytes = fs.readFileSync(replacement);
        replacementImage = disposable(new mupdf.Image(replacementBytes));
        Logger.debug(
          `Loaded replacement image: ${replacement} (${replacementImage.getWidth()}x${replacementImage.getHeight()})`,
        );
      } catch (error) {
        sourceImage[Symbol.dispose]();
        replacementImage?.[Symbol.dispose]();
        Logger.logWarn(
          `Failed to load replacement image: ${replacement}: ${String(error)}`,
        );
        continue;
      }

      loadedImages.push(sourceImage, replacementImage);
      replaceFns.push(({ image }) => {
        if (!imagesEqual(image, sourceImage)) {
          return null;
        }
        return {
          image: new mupdf.Image(replacementImage.pointer),
          sourceLabel: source,
          replacementLabel: replacement,
        };
      });
    }
  } catch (error) {
    disposeImages(loadedImages);
    throw error;
  }
  const replaceFn: ReplaceFn | null =
    replaceFns.length === 0
      ? null
      : async (context) => {
          for (const replace of replaceFns) {
            const inputImage = new mupdf.Image(context.image.pointer);
            let inputMoved = false;
            try {
              const replacement = await replace({ image: inputImage });
              if (replacement !== null) {
                inputMoved = replacement.image === inputImage;
                return replacement;
              }
            } finally {
              if (!inputMoved) {
                inputImage.destroy();
              }
            }
          }
          return null;
        };
  return {
    replaceFn,
    loadedImages,
  };
}

interface DeviceCmykIncompatibleImage {
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
): DeviceCmykIncompatibleImage | null {
  using imageColorSpace = disposableOrNull(image.getColorSpace());
  const colorSpace = imageColorSpace?.getName() ?? 'None';
  if (
    image.getImageMask() ||
    colorSpace === 'DeviceCMYK' ||
    colorSpace === 'DeviceGray'
  ) {
    return null;
  }
  return {
    key,
    colorSpace,
    width: image.getWidth(),
    height: image.getHeight(),
    pageIndex,
  };
}

function addImagePreservingColorSpace(
  doc: mupdfType.PDFDocument,
  image: mupdfType.Image,
): { ref: mupdfType.PDFObject; objectNumbers: Set<number> } {
  const xrefLengthBefore = doc.countObjects();
  const ref = doc.addImage(image);
  const objectNumbers = collectReachableObjectNumbers([ref]);
  for (const objectNumber of objectNumbers) {
    if (objectNumber < xrefLengthBefore) {
      objectNumbers.delete(objectNumber);
    }
  }
  using imageColorSpace = disposableOrNull(image.getColorSpace());
  const colorSpaceName = imageColorSpace?.getName();

  if (
    colorSpaceName === 'DeviceGray' ||
    colorSpaceName === 'DeviceCMYK' ||
    // This intentionally differs from Chromium/Skia, which attaches a Skia ICC profile even to unprofiled images.
    // Preserving DeviceRGB here is the only way to represent an unprofiled RGB replacement as such.
    colorSpaceName === 'DeviceRGB'
  ) {
    ref.resolve().put('ColorSpace', colorSpaceName);
  }

  return { ref, objectNumbers };
}

function collectReachableObjectNumbers(
  roots: Iterable<mupdfType.PDFObject>,
): Set<number> {
  const reachable = new Set<number>();
  const pending = [...roots];

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

function removeUnreferencedCandidates(
  doc: mupdfType.PDFDocument,
  candidates: Set<number>,
): void {
  if (candidates.size === 0) {
    return;
  }

  const roots: mupdfType.PDFObject[] = [doc.getTrailer()];
  const xrefLength = doc.countObjects();
  for (let objectNumber = 1; objectNumber < xrefLength; objectNumber++) {
    if (candidates.has(objectNumber)) {
      continue;
    }
    const ref = doc.newIndirect(objectNumber);
    if (!ref.resolve().isNull()) {
      roots.push(ref);
    }
  }
  const referenced = collectReachableObjectNumbers(roots);

  for (const objectNumber of candidates) {
    if (!referenced.has(objectNumber)) {
      doc.deleteObject(objectNumber);
    }
  }
}

function addReplacementImage(
  doc: mupdfType.PDFDocument,
  source: mupdfType.PDFObject,
  image: mupdfType.Image,
): { ref: mupdfType.PDFObject; cleanupCandidates: ReadonlySet<number> } {
  const cleanupCandidates = new Set<number>();
  const sourceObjectNumbers = collectReachableObjectNumbers([source]);
  const replacement = addImagePreservingColorSpace(doc, image);
  const replacementObjectNumbers = collectReachableObjectNumbers([
    replacement.ref,
  ]);

  for (const objectNumber of sourceObjectNumbers) {
    cleanupCandidates.add(objectNumber);
  }
  for (const objectNumber of replacement.objectNumbers) {
    if (!replacementObjectNumbers.has(objectNumber)) {
      cleanupCandidates.add(objectNumber);
    }
  }

  return { ref: replacement.ref, cleanupCandidates };
}

type ReplaceImageResult =
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'replaced';
      readonly cleanupCandidates: ReadonlySet<number>;
    };

async function replaceImage(
  node: PdfImageXObjectNode,
  replaceFn: ReplaceFn | null,
  incompatibleImages: DeviceCmykIncompatibleImage[] | null,
): Promise<ReplaceImageResult> {
  using pdfImage = disposable(node.document.loadImage(node.object));
  let replacementRef: mupdfType.PDFObject | null = null;
  let cleanupCandidates: ReadonlySet<number> | null = null;

  if (node.resourceVisit === 'initial' && replaceFn !== null) {
    const replacement = await replaceFn({
      image: pdfImage,
    });
    if (replacement !== null) {
      using replacementImage = disposable(replacement.image);
      const addedImage = addReplacementImage(
        node.document,
        node.object,
        replacementImage,
      );
      replacementRef = addedImage.ref;
      cleanupCandidates = addedImage.cleanupCandidates;
      node.replaceWith(replacementRef);
      Logger.debug(
        `  Page ${node.pageIndex + 1}, ref "${node.key}": ${replacement.sourceLabel} -> ${replacement.replacementLabel}`,
      );
    }
  }

  if (incompatibleImages !== null) {
    let incompatibleImage: DeviceCmykIncompatibleImage | null = null;
    if (replacementRef === null) {
      incompatibleImage = collectDeviceCmykIncompatibleImage(
        pdfImage,
        node.key,
        node.pageIndex,
      );
    } else {
      using replacementImage = disposable(
        node.document.loadImage(replacementRef),
      );
      incompatibleImage = collectDeviceCmykIncompatibleImage(
        replacementImage,
        node.key,
        node.pageIndex,
      );
    }
    if (incompatibleImage) {
      incompatibleImages.push(incompatibleImage);
    }
  }

  return cleanupCandidates
    ? { kind: 'replaced', cleanupCandidates }
    : { kind: 'unchanged' };
}

export async function createReplaceImageHook(
  replacements: ReplaceImageConfig,
  ifIncompatibleImagesFound: CmykConfig['ifIncompatibleImagesFound'],
  failures: string[],
): Promise<PdfEditHook & Disposable> {
  const { replaceFn, loadedImages } = await createReplaceFn(replacements);
  if (replaceFn === null && ifIncompatibleImagesFound === 'ignore') {
    return {
      [Symbol.dispose]() {},
    };
  }

  const incompatibleImages: DeviceCmykIncompatibleImage[] | null =
    ifIncompatibleImagesFound === 'ignore' ? null : [];
  let replaced = 0;
  let total = 0;
  const cleanupCandidateBatches: ReadonlySet<number>[] = [];
  return {
    async visit(node) {
      if (node.kind !== 'image-xobject') {
        return;
      }
      const result = await replaceImage(node, replaceFn, incompatibleImages);
      total++;
      if (result.kind === 'replaced') {
        replaced++;
        cleanupCandidateBatches.push(result.cleanupCandidates);
      }
    },
    complete(document) {
      const cleanupCandidates = new Set<number>();
      for (const batch of cleanupCandidateBatches) {
        for (const objectNumber of batch) {
          cleanupCandidates.add(objectNumber);
        }
      }
      removeUnreferencedCandidates(document, cleanupCandidates);

      Logger.debug(`Replaced ${replaced} of ${total} images`);
      if (!incompatibleImages) {
        return;
      }
      for (const incompatibleImage of incompatibleImages) {
        Logger.logWarn(
          `Image color space is incompatible with Device CMYK: ref "${incompatibleImage.key}" (${incompatibleImage.colorSpace}, ${incompatibleImage.width}x${incompatibleImage.height}) on page ${incompatibleImage.pageIndex + 1}`,
        );
      }
      if (
        incompatibleImages.length > 0 &&
        ifIncompatibleImagesFound === 'error'
      ) {
        failures.push(
          `${incompatibleImages.length} image(s) incompatible with Device CMYK color`,
        );
      }
    },
    [Symbol.dispose]() {
      disposeImages(loadedImages);
    },
  };
}

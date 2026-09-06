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

interface ImagePair {
  srcImage: mupdfType.Image & Disposable;
  destImage: mupdfType.Image & Disposable;
  sourcePath: string;
  replacementPath: string;
}

function disposeImagePairs(imagePairs: readonly ImagePair[]): void {
  for (const pair of imagePairs) {
    pair.srcImage[Symbol.dispose]();
    pair.destImage[Symbol.dispose]();
  }
}

async function createImagePairs(
  replacements: ReplaceImageConfig,
): Promise<ImagePair[]> {
  if (replacements.length === 0) {
    return [];
  }
  const mupdf = await importNodeModule('mupdf');
  const imagePairs: ImagePair[] = [];
  try {
    for (const { source, replacement } of replacements) {
      let srcImage: mupdfType.Image & Disposable;
      let destImage: mupdfType.Image & Disposable;

      try {
        const srcBuffer = fs.readFileSync(source);
        srcImage = disposable(new mupdf.Image(srcBuffer));
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
        destImage = disposable(new mupdf.Image(destBuffer));
        Logger.debug(
          `Loaded replacement image: ${replacement} (${destImage.getWidth()}x${destImage.getHeight()})`,
        );
      } catch (error) {
        srcImage[Symbol.dispose]();
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
  } catch (error) {
    disposeImagePairs(imagePairs);
    throw error;
  }
  return imagePairs;
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

function replaceImage(
  node: PdfImageXObjectNode,
  imagePairs: readonly ImagePair[],
  incompatibleImages: DeviceCmykIncompatibleImage[] | null,
): ReplaceImageResult {
  using pdfImage = disposable(node.document.loadImage(node.object));
  let replacementRef: mupdfType.PDFObject | null = null;
  let cleanupCandidates: ReadonlySet<number> | null = null;

  if (node.resourceVisit === 'initial') {
    const pair = imagePairs.find((candidate) =>
      imagesEqual(pdfImage, candidate.srcImage),
    );
    if (pair) {
      const replacement = addReplacementImage(
        node.document,
        node.object,
        pair.destImage,
      );
      replacementRef = replacement.ref;
      cleanupCandidates = replacement.cleanupCandidates;
      node.replaceWith(replacementRef);
      Logger.debug(
        `  Page ${node.pageIndex + 1}, ref "${node.key}": ${pair.sourcePath} -> ${pair.replacementPath}`,
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
  const imagePairs = await createImagePairs(replacements);
  if (imagePairs.length === 0 && ifIncompatibleImagesFound === 'ignore') {
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
    visit(node) {
      if (node.kind !== 'image-xobject') {
        return;
      }
      const result = replaceImage(node, imagePairs, incompatibleImages);
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
      disposeImagePairs(imagePairs);
    },
  };
}

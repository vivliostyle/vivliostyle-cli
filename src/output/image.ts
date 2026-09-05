import fs from 'node:fs';

import type * as mupdfType from 'mupdf';

import type { CmykConfig } from '../config/resolve.js';
import type {
  ResolvedReplaceImageConfig,
  ResolvedReplacement,
} from '../config/schema.js';
import { createImageConversionReplaceFunction } from '../image-replacement.js';
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

function premultiplySkiaColorSample(sample: number, alpha: number): number {
  // NOTE: Chromium/Skia writes unpremultiplied RGB and alpha separately.
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=236-259
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=127-168
  // This mirrors SkMulDiv255Round used by SkPremultiplyARGBInline.
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/core/SkColorPriv.h;l=120-132
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/include/private/SkMath.h;l=61-75
  // MuPDF decodes PNG alpha into premultiplied samples with the same formula.
  // https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/source/fitz/load-png.c#L663-L664
  // https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/source/fitz/pixmap.c#L777-L797
  // https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/include/mupdf/fitz/geometry.h#L38-L43
  const product = sample * alpha + 128;
  return (product + (product >> 8)) >> 8;
}

function pixmapsEqual(
  pdfPixmap: mupdfType.Pixmap,
  sourcePixmap: mupdfType.Pixmap,
  maskPixmap: mupdfType.Pixmap | null,
  sourceGrayExpandedToRgb: boolean,
): boolean {
  const pdfHasAlpha = pdfPixmap.getAlpha() !== 0;
  const sourceHasAlpha = sourcePixmap.getAlpha() !== 0;
  const pdfColorComponents =
    pdfPixmap.getNumberOfComponents() - Number(pdfHasAlpha);
  const sourceColorComponents =
    sourcePixmap.getNumberOfComponents() - Number(sourceHasAlpha);
  if (
    pdfColorComponents !== sourceColorComponents &&
    !(
      sourceGrayExpandedToRgb &&
      pdfColorComponents === 3 &&
      sourceColorComponents === 1
    )
  ) {
    return false;
  }
  if (
    maskPixmap !== null &&
    (maskPixmap.getWidth() !== pdfPixmap.getWidth() ||
      maskPixmap.getHeight() !== pdfPixmap.getHeight())
  ) {
    // NOTE: Chromium/Skia writes the base image and its soft mask from the
    // same pixmap dimensions.
    // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=127-168
    // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=275-283
    return false;
  }
  if (
    maskPixmap === null &&
    pdfHasAlpha === sourceHasAlpha &&
    !sourceGrayExpandedToRgb
  ) {
    const pdfPixels = pdfPixmap.getPixels();
    const sourcePixels = sourcePixmap.getPixels();
    return (
      pdfPixels.length === sourcePixels.length &&
      Buffer.compare(Buffer.from(pdfPixels), Buffer.from(sourcePixels)) === 0
    );
  }

  const pdfPixels = pdfPixmap.getPixels();
  const sourcePixels = sourcePixmap.getPixels();
  const maskPixels = maskPixmap?.getPixels();
  const pdfStride = pdfPixmap.getStride();
  const sourceStride = sourcePixmap.getStride();
  const maskStride = maskPixmap?.getStride() ?? 0;
  const pdfComponents = pdfPixmap.getNumberOfComponents();
  const sourceComponents = sourcePixmap.getNumberOfComponents();
  const maskComponents = maskPixmap?.getNumberOfComponents() ?? 0;
  const width = pdfPixmap.getWidth();
  const height = pdfPixmap.getHeight();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pdfOffset = y * pdfStride + x * pdfComponents;
      const sourceOffset = y * sourceStride + x * sourceComponents;
      const maskOffset = y * maskStride + x * maskComponents;
      const pdfAlpha = maskPixels
        ? maskPixels[maskOffset + maskComponents - 1]
        : pdfHasAlpha
          ? pdfPixels[pdfOffset + pdfColorComponents]
          : 255;
      const sourceAlpha = sourceHasAlpha
        ? sourcePixels[sourceOffset + sourceColorComponents]
        : 255;
      if (pdfAlpha !== sourceAlpha) {
        return false;
      }
      for (let component = 0; component < pdfColorComponents; component++) {
        const pdfSample =
          pdfHasAlpha && maskPixmap === null
            ? pdfPixels[pdfOffset + component]
            : premultiplySkiaColorSample(
                pdfPixels[pdfOffset + component],
                pdfAlpha,
              );
        const sourceComponent = sourceGrayExpandedToRgb ? 0 : component;
        if (pdfSample !== sourcePixels[sourceOffset + sourceComponent]) {
          return false;
        }
      }
    }
  }
  return true;
}

function imagesEqual(
  pdfImage: mupdfType.Image,
  sourceImage: mupdfType.Image,
): boolean {
  if (
    pdfImage.getWidth() !== sourceImage.getWidth() ||
    pdfImage.getHeight() !== sourceImage.getHeight()
  ) {
    return false;
  }

  using pdfPixmap = disposable(pdfImage.toPixmap());
  using sourcePixmap = disposable(sourceImage.toPixmap());

  using pdfColorSpace = disposableOrNull(pdfPixmap.getColorSpace());
  using sourceColorSpace = disposableOrNull(sourcePixmap.getColorSpace());
  const matchingColorSpaces =
    pdfColorSpace !== null &&
    sourceColorSpace !== null &&
    ((pdfColorSpace.isRGB() && sourceColorSpace.isRGB()) ||
      (pdfColorSpace.isCMYK() && sourceColorSpace.isCMYK()) ||
      (pdfColorSpace.isGray() && sourceColorSpace.isGray()));
  // NOTE: Chromium/Skia preserves DeviceGray only for opaque kGray_8 images;
  // gray images with alpha take the BGRA-backed DeviceRGB path.
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=346-368
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=220-259
  const sourceGrayExpandedToRgb =
    pdfColorSpace?.isRGB() === true &&
    sourceColorSpace?.isGray() === true &&
    sourcePixmap.getAlpha() !== 0;
  if (
    pdfColorSpace === null ||
    sourceColorSpace === null ||
    (!matchingColorSpaces && !sourceGrayExpandedToRgb)
  ) {
    return false;
  }

  using maskImage = disposableOrNull(pdfImage.getMask());
  using maskPixmap = disposableOrNull(maskImage?.toPixmap() ?? null);
  return pixmapsEqual(
    pdfPixmap,
    sourcePixmap,
    maskPixmap,
    sourceGrayExpandedToRgb,
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

const NO_REPLACEMENT_NEEDED = Symbol('no-replacement-needed');

type ReplaceFn = (
  context: ReplaceContext,
) =>
  | Replacement
  | typeof NO_REPLACEMENT_NEEDED
  | null
  | Promise<Replacement | typeof NO_REPLACEMENT_NEEDED | null>;

function disposeImages(
  images: readonly (mupdfType.Image & Disposable)[],
): void {
  for (const image of images) {
    image[Symbol.dispose]();
  }
}

async function createReplaceFn(
  replacements: ResolvedReplaceImageConfig,
): Promise<{
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
  type PreparedReplaceFunction = ReturnType<
    typeof createImageConversionReplaceFunction
  >;
  const conversionFunctions = new WeakMap<object, PreparedReplaceFunction>();

  const getReplaceFunction = (
    replacement: ResolvedReplacement,
  ): PreparedReplaceFunction => {
    if ('replaceFunction' in replacement) {
      return {
        replaceFunction: replacement.replaceFunction,
        builtinDestination: null,
      };
    }
    const cached = conversionFunctions.get(replacement.imageConversion);
    if (cached) {
      return cached;
    }
    const created = createImageConversionReplaceFunction(
      replacement.imageConversion,
    );
    conversionFunctions.set(replacement.imageConversion, created);
    return created;
  };

  const wrapReplaceFunction = (
    replacement: ResolvedReplacement,
    sourceLabel: string,
  ): ReplaceFn => {
    const { replaceFunction, builtinDestination } =
      getReplaceFunction(replacement);
    return async (context) => {
      if (builtinDestination !== null) {
        using colorSpace = disposableOrNull(context.image.getColorSpace());
        // MuPDF exposes built-in Device color spaces as canonical native objects,
        // so pointer equality distinguishes them from ICCBased and calibrated
        // spaces. Preserve an exact match without re-encoding it; null would
        // continue to the next replacement candidate.
        if (
          colorSpace?.pointer === mupdf.ColorSpace[builtinDestination].pointer
        ) {
          return NO_REPLACEMENT_NEEDED;
        }
      }
      const replacementImage = await replaceFunction({
        image: context.image,
        mupdf,
      });
      if (replacementImage === null) {
        return null;
      }
      if (!(replacementImage instanceof mupdf.Image)) {
        throw new TypeError(
          `${replacement.label} must return a mupdf.Image created by context.mupdf or null`,
        );
      }
      return {
        image: replacementImage,
        sourceLabel,
        replacementLabel: replacement.label,
      };
    };
  };

  try {
    for (const rule of replacements) {
      if (!('source' in rule)) {
        replaceFns.push(wrapReplaceFunction(rule, '[*]'));
        continue;
      }
      const { source, replacement } = rule;
      const replacementLabel =
        typeof replacement === 'string' ? replacement : replacement.label;
      let sourceImage: mupdfType.Image & Disposable;

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

      if (typeof replacement !== 'string') {
        loadedImages.push(sourceImage);
        const replace = wrapReplaceFunction(replacement, source);
        replaceFns.push((context) => {
          if (!imagesEqual(context.image, sourceImage)) {
            return null;
          }
          return replace(context);
        });
        continue;
      }

      let replacementImage: (mupdfType.Image & Disposable) | undefined;
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
          replacementLabel,
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
          // NOTE: If multiple matched files contain pixel-identical images,
          // the same replacement function may be called once per match. This
          // is only a small overhead when repeated calls with the same input
          // return the same result, but a stateful function can make the
          // result depend on the matched-file order. Whether replacement
          // functions should instead run once per PDF image remains unsettled.
          for (const replace of replaceFns) {
            const inputImage = new mupdf.Image(context.image.pointer);
            let inputMoved = false;
            try {
              const replacement = await replace({ image: inputImage });
              if (replacement !== null) {
                inputMoved =
                  replacement !== NO_REPLACEMENT_NEEDED &&
                  replacement.image === inputImage;
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

// ITU-T T.800 (06/2019) sections I.5.3 and I.5.3.6 define the `jp2h` and
// `cdef` box types; Table I.16 assigns 1 to opacity and 2 to premultiplied
// opacity. PDF 32000-1:2008 section 8.9.5, Table 89 uses the same values for
// `/SMaskInData`.
// https://www.itu.int/rec/dologin_pub.asp?lang=e&id=T-REC-T.800-201906-S!!PDF-E&type=items
// https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
const JP2_HEADER_BOX_TYPE = 0x6a703268;
const JP2_CHANNEL_DEFINITION_BOX_TYPE = 0x63646566;
const JP2_UNASSOCIATED_ALPHA = 1;
const JP2_PREMULTIPLIED_ALPHA = 2;

interface Jp2ChannelDefinition {
  channelIndex: number;
  type: number;
  association: number;
}

interface Jp2Box {
  type: number;
  contentStart: number;
  end: number;
}

function readJp2Box(
  view: DataView,
  offset: number,
  end: number,
): Jp2Box | null {
  if (offset + 8 > end) {
    return null;
  }
  let boxLength = view.getUint32(offset);
  const type = view.getUint32(offset + 4);
  let headerLength = 8;
  if (boxLength === 1) {
    if (offset + 16 > end) {
      return null;
    }
    const extendedLength = view.getBigUint64(offset + 8);
    if (extendedLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    boxLength = Number(extendedLength);
    headerLength = 16;
  } else if (boxLength === 0) {
    boxLength = end - offset;
  }
  if (boxLength < headerLength || offset + boxLength > end) {
    return null;
  }
  return {
    type,
    contentStart: offset + headerLength,
    end: offset + boxLength,
  };
}

function getJp2AlphaType(
  definitions: readonly Jp2ChannelDefinition[],
): typeof JP2_UNASSOCIATED_ALPHA | typeof JP2_PREMULTIPLIED_ALPHA | null {
  const alphaDefinitions = definitions.filter(
    ({ type }) =>
      type === JP2_UNASSOCIATED_ALPHA || type === JP2_PREMULTIPLIED_ALPHA,
  );
  if (alphaDefinitions.length === 0) {
    return null;
  }

  const alphaChannelIndexes = new Set(
    alphaDefinitions.map(({ channelIndex }) => channelIndex),
  );
  const alphaTypes = new Set(alphaDefinitions.map(({ type }) => type));
  const alphaAssociations = new Set(
    alphaDefinitions.map(({ association }) => association),
  );
  const colorAssociations = new Set(
    definitions
      .filter(({ type, association }) => type === 0 && association !== 0xffff)
      .map(({ association }) => association),
  );
  const appliesToAllColors =
    alphaAssociations.has(0) ||
    (colorAssociations.size > 0 &&
      colorAssociations.isSubsetOf(alphaAssociations));
  if (
    alphaChannelIndexes.size !== 1 ||
    alphaTypes.size !== 1 ||
    !appliesToAllColors
  ) {
    throw new TypeError(
      'JPX replacement alpha must use one opacity channel that applies to all color channels',
    );
  }
  return alphaDefinitions[0].type === JP2_UNASSOCIATED_ALPHA
    ? JP2_UNASSOCIATED_ALPHA
    : JP2_PREMULTIPLIED_ALPHA;
}

function readJp2ChannelDefinitions(
  view: DataView,
  start: number,
  end: number,
): Jp2ChannelDefinition[] | null {
  for (let offset = start; offset + 8 <= end; ) {
    const box = readJp2Box(view, offset, end);
    if (box === null) {
      return null;
    }
    if (
      box.type === JP2_CHANNEL_DEFINITION_BOX_TYPE &&
      box.contentStart + 2 <= box.end
    ) {
      const entryCount = view.getUint16(box.contentStart);
      const definitions: Jp2ChannelDefinition[] = [];
      for (let index = 0; index < entryCount; index++) {
        const entryOffset = box.contentStart + 2 + index * 6;
        if (entryOffset + 6 > box.end) {
          return null;
        }
        definitions.push({
          channelIndex: view.getUint16(entryOffset),
          type: view.getUint16(entryOffset + 2),
          association: view.getUint16(entryOffset + 4),
        });
      }
      return definitions;
    }
    offset = box.end;
  }
  return null;
}

function findJp2AlphaType(
  view: DataView,
): typeof JP2_UNASSOCIATED_ALPHA | typeof JP2_PREMULTIPLIED_ALPHA | null {
  for (let offset = 0; offset + 8 <= view.byteLength; ) {
    const box = readJp2Box(view, offset, view.byteLength);
    if (box === null) {
      return null;
    }
    if (box.type === JP2_HEADER_BOX_TYPE) {
      const definitions = readJp2ChannelDefinitions(
        view,
        box.contentStart,
        box.end,
      );
      return definitions === null ? null : getJp2AlphaType(definitions);
    }
    offset = box.end;
  }
  return null;
}

function setJpxEmbeddedAlphaParameter(
  doc: mupdfType.PDFDocument,
  imageRef: mupdfType.PDFObject,
): void {
  // NOTE: Chromium/Skia serializes browser images as JPEG or deflated samples,
  // writes alpha as a separate `/SMask` reference, and omits the entry when
  // there is no mask. Source images in `browserResult.pdf` therefore do not
  // use JPX `/SMaskInData`.
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=380
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=398
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=275
  // https://source.chromium.org/chromium/chromium/src/+/refs/tags/152.0.7977.54:third_party/skia/src/pdf/SkPDFBitmap.cpp;l=111
  const imageObject = imageRef.resolve();
  if (
    imageObject.get('Filter').toString() !== '/JPXDecode' ||
    !imageObject.get('SMask').isNull() ||
    !imageObject.get('Mask').isNull()
  ) {
    return;
  }

  using data = disposable(imageRef.readRawStream());
  const bytes = data.asUint8Array();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const alphaType = findJp2AlphaType(view);
  if (alphaType !== null) {
    imageObject.put('SMaskInData', doc.newInteger(alphaType));
  }
}

function addImagePreservingColorSpace(
  doc: mupdfType.PDFDocument,
  image: mupdfType.Image,
): { ref: mupdfType.PDFObject; objectNumbers: Set<number> } {
  const xrefLengthBefore = doc.countObjects();
  const ref = doc.addImage(image);
  setJpxEmbeddedAlphaParameter(doc, ref);
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
    if (replacement !== null && replacement !== NO_REPLACEMENT_NEEDED) {
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
  replacements: ResolvedReplaceImageConfig,
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

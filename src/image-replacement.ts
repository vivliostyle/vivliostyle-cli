import fs from 'node:fs';

import type * as mupdfType from 'mupdf';

import type {
  ImageConversionReplacement,
  ReplaceFunction,
} from './config/schema.js';

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

/** Options shared by image color conversion replacements. */
export interface ColorConversionOptions {
  /**
   * Path to an ICC profile used to interpret an unprofiled DeviceGray,
   * DeviceRGB, or DeviceCMYK input. It must use the same color space as the
   * input image. Relative paths use the same entry context as `replaceImage`
   * source and replacement paths.
   */
  inputProfile?: string;
}

/** Options for conversion using a caller-provided destination ICC profile. */
export interface IccConversionOptions extends ColorConversionOptions {
  /**
   * Path to the destination ICC profile. Relative paths use the same entry
   * context as `replaceImage` source and replacement paths. The converted
   * image uses the corresponding Device color space; the profile itself is
   * not embedded in the image.
   */
  outputProfile: string;
}

type Mupdf = typeof import('mupdf');
type DeviceColorSpaceType = 'Gray' | 'RGB' | 'CMYK';
type BuiltinDestination = `Device${DeviceColorSpaceType}`;
interface LoadedColorConversionOptions {
  inputProfile?: Uint8Array;
}
interface LoadedIccConversionOptions extends LoadedColorConversionOptions {
  outputProfile: Uint8Array;
}

function copyProfile(profile: Uint8Array | undefined): Uint8Array | undefined {
  return profile && new Uint8Array(profile);
}

function getDeviceColorSpaceType(
  colorSpace: mupdfType.ColorSpace,
  mupdf: Mupdf,
): DeviceColorSpaceType | null {
  if (colorSpace.pointer === mupdf.ColorSpace.DeviceGray.pointer) {
    return 'Gray';
  }
  if (colorSpace.pointer === mupdf.ColorSpace.DeviceRGB.pointer) {
    return 'RGB';
  }
  if (colorSpace.pointer === mupdf.ColorSpace.DeviceCMYK.pointer) {
    return 'CMYK';
  }
  return null;
}

function convertPixmap(
  pixmap: mupdfType.Pixmap,
  destination: mupdfType.ColorSpace,
  outputColorSpace: mupdfType.ColorSpace | undefined,
  mupdf: Mupdf,
): mupdfType.Image {
  using converted = disposable(pixmap.convertToColorSpace(destination, true));
  if (!outputColorSpace) {
    return new mupdf.Image(converted);
  }
  using output = disposable(
    new mupdf.Pixmap(
      outputColorSpace,
      [
        converted.getX(),
        converted.getY(),
        converted.getX() + converted.getWidth(),
        converted.getY() + converted.getHeight(),
      ],
      converted.getAlpha() !== 0,
    ),
  );
  output.setResolution(converted.getXResolution(), converted.getYResolution());
  copyPixmapSamples(converted, output);
  return new mupdf.Image(output);
}

function copyPixmapSamples(
  source: mupdfType.Pixmap,
  destination: mupdfType.Pixmap,
): void {
  const sourcePixels = source.getPixels();
  const destinationPixels = destination.getPixels();
  const sourceStride = source.getStride();
  const destinationStride = destination.getStride();
  const rowLength = source.getWidth() * source.getNumberOfComponents();

  for (let y = 0; y < source.getHeight(); y++) {
    const sourceOffset = y * sourceStride;
    destinationPixels.set(
      sourcePixels.subarray(sourceOffset, sourceOffset + rowLength),
      y * destinationStride,
    );
  }
}

function convertImage(
  image: mupdfType.Image,
  destination: mupdfType.ColorSpace,
  outputColorSpace: mupdfType.ColorSpace | undefined,
  inputProfile: Uint8Array | undefined,
  mupdf: Mupdf,
): mupdfType.Image {
  using source = disposable(image.toPixmap());
  if (!inputProfile) {
    return convertPixmap(source, destination, outputColorSpace, mupdf);
  }

  using sourceColorSpace = disposableOrNull(source.getColorSpace());
  if (!sourceColorSpace) {
    return convertPixmap(source, destination, outputColorSpace, mupdf);
  }
  const deviceColorSpaceType = getDeviceColorSpaceType(sourceColorSpace, mupdf);
  if (!deviceColorSpaceType) {
    return convertPixmap(source, destination, outputColorSpace, mupdf);
  }

  using inputColorSpace = disposable(
    new mupdf.ColorSpace(inputProfile, 'input-profile'),
  );
  if (inputColorSpace.getType() !== deviceColorSpaceType) {
    throw new TypeError(
      `inputProfile uses ${inputColorSpace.getType()}, but the input image uses Device${deviceColorSpaceType}`,
    );
  }

  using interpreted = disposable(
    new mupdf.Pixmap(
      inputColorSpace,
      [
        source.getX(),
        source.getY(),
        source.getX() + source.getWidth(),
        source.getY() + source.getHeight(),
      ],
      source.getAlpha() !== 0,
    ),
  );
  interpreted.setResolution(source.getXResolution(), source.getYResolution());
  copyPixmapSamples(source, interpreted);
  return convertPixmap(interpreted, destination, outputColorSpace, mupdf);
}

function createBuiltinConversionReplaceFunction(
  destination: BuiltinDestination,
  options: LoadedColorConversionOptions,
): ReplaceFunction {
  const inputProfile = copyProfile(options.inputProfile);

  return ({ image, mupdf }) => {
    return convertImage(
      image,
      mupdf.ColorSpace[destination],
      undefined,
      inputProfile,
      mupdf,
    );
  };
}

/** Creates a replacement that converts images to DeviceGray. */
export function createBuiltinGrayConversionReplacement(
  options: ColorConversionOptions = {},
): ImageConversionReplacement {
  return Object.freeze({
    kind: 'builtin',
    destination: 'DeviceGray',
    inputProfile: options.inputProfile,
  });
}

/** Creates a replacement that converts images to DeviceRGB. */
export function createBuiltinRgbConversionReplacement(
  options: ColorConversionOptions = {},
): ImageConversionReplacement {
  return Object.freeze({
    kind: 'builtin',
    destination: 'DeviceRGB',
    inputProfile: options.inputProfile,
  });
}

/** Creates a replacement that converts images to DeviceCMYK. */
export function createBuiltinCmykConversionReplacement(
  options: ColorConversionOptions = {},
): ImageConversionReplacement {
  return Object.freeze({
    kind: 'builtin',
    destination: 'DeviceCMYK',
    inputProfile: options.inputProfile,
  });
}

/**
 * Creates a replacement that converts images using a destination ICC
 * profile and returns an image in the corresponding Device color space.
 */
export function createIccConversionReplacement(
  options: IccConversionOptions,
): ImageConversionReplacement {
  return Object.freeze({
    kind: 'icc',
    inputProfile: options.inputProfile,
    outputProfile: options.outputProfile,
  });
}

function createIccConversionReplaceFunction(
  options: LoadedIccConversionOptions,
): ReplaceFunction {
  const inputProfile = copyProfile(options.inputProfile);
  const outputProfile = new Uint8Array(options.outputProfile);

  return ({ image, mupdf }) => {
    using destination = disposable(
      new mupdf.ColorSpace(outputProfile, 'output-profile'),
    );
    const destinationType = destination.getType();
    // NOTE: Lab is the only ICC color space that reaches this check. Unlike Gray, RGB, and CMYK, it has neither a Device color-space destination nor a PAM representation for a profile-free output image.
    if (
      destinationType !== 'Gray' &&
      destinationType !== 'RGB' &&
      destinationType !== 'CMYK'
    ) {
      throw new TypeError(
        `outputProfile must use a Gray, RGB, or CMYK color space, but uses ${destinationType}`,
      );
    }
    return convertImage(
      image,
      destination,
      mupdf.ColorSpace[`Device${destinationType}`],
      inputProfile,
      mupdf,
    );
  };
}

export function createImageConversionReplaceFunction(
  replacement: ImageConversionReplacement,
): {
  replaceFunction: ReplaceFunction;
  builtinDestination: BuiltinDestination | null;
} {
  const inputProfile =
    replacement.inputProfile === undefined
      ? undefined
      : fs.readFileSync(replacement.inputProfile);
  if (replacement.kind === 'builtin') {
    return {
      replaceFunction: createBuiltinConversionReplaceFunction(
        replacement.destination,
        { inputProfile },
      ),
      builtinDestination: inputProfile ? null : replacement.destination,
    };
  }
  return {
    replaceFunction: createIccConversionReplaceFunction({
      inputProfile,
      outputProfile: fs.readFileSync(replacement.outputProfile),
    }),
    builtinDestination: null,
  };
}

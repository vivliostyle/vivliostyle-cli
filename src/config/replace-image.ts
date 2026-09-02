import type * as mupdfType from 'mupdf';

/** Values available while a replacement function is running. */
export interface ReplaceFunctionContext {
  /**
   * The current PDF image as an owned reference scoped to this invocation.
   * Its ownership is moved into the replacement function and Vivliostyle CLI
   * destroys it when the function settles unless it is returned as the
   * replacement. It must not be destroyed manually or retained after the
   * function settles. Native objects returned by its methods are owned by the
   * replacement function and must be destroyed before it settles unless that
   * object is an image returned as the replacement.
   */
  image: mupdfType.Image;
  /** The MuPDF module that owns the current image. */
  mupdf: typeof import('mupdf');
}

/**
 * Returns an owned replacement image, transferring its ownership to
 * Vivliostyle CLI, or `null` to decline the current match and continue to the
 * next replacement candidate. The returned image must be created with the
 * supplied `mupdf` module and must not be used or destroyed after it is
 * returned. The current `image` may be returned directly to use it as the
 * replacement.
 */
export type ReplaceFunction = (
  context: ReplaceFunctionContext,
) => mupdfType.Image | null | Promise<mupdfType.Image | null>;

export type ImageConversionReplacement =
  | Readonly<{
      kind: 'builtin';
      destination: 'DeviceGray' | 'DeviceRGB' | 'DeviceCMYK';
      inputProfile?: string;
    }>
  | Readonly<{
      kind: 'icc';
      inputProfile?: string;
      outputProfile: string;
    }>;

export function isImageConversionReplacement(
  value: unknown,
): value is ImageConversionReplacement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if ('source' in value || 'replacement' in value) {
    return false;
  }
  const inputProfile: unknown = Reflect.get(value, 'inputProfile');
  if (
    inputProfile !== undefined &&
    (typeof inputProfile !== 'string' || inputProfile.trim().length === 0)
  ) {
    return false;
  }
  const kind: unknown = Reflect.get(value, 'kind');
  if (kind === 'builtin') {
    const destination: unknown = Reflect.get(value, 'destination');
    return (
      destination === 'DeviceGray' ||
      destination === 'DeviceRGB' ||
      destination === 'DeviceCMYK'
    );
  }
  const outputProfile: unknown = Reflect.get(value, 'outputProfile');
  return (
    kind === 'icc' &&
    typeof outputProfile === 'string' &&
    outputProfile.trim().length > 0
  );
}

export interface ReplaceImageEntry {
  source: string | RegExp;
  replacement: string | ReplaceFunction | ImageConversionReplacement;
}

export type BareImageConversionReplacement = ImageConversionReplacement &
  Readonly<{
    source?: never;
    replacement?: never;
  }>;

export type ReplaceImageConfig = (
  | ReplaceImageEntry
  | ReplaceFunction
  | BareImageConversionReplacement
)[];

export interface ResolvedReplaceFunction {
  replaceFunction: ReplaceFunction;
  label: string;
}

export interface ResolvedImageConversionReplacement {
  imageConversion: ImageConversionReplacement;
  label: string;
}

export type ResolvedReplacement =
  | ResolvedReplaceFunction
  | ResolvedImageConversionReplacement;

export interface ResolvedReplaceImageEntry {
  source: string;
  replacement: string | ResolvedReplacement;
}

export type ResolvedReplaceImageConfig = (
  | ResolvedReplaceImageEntry
  | ResolvedReplacement
)[];

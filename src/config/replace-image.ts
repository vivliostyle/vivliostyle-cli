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

export interface ReplaceImageEntry {
  source: string | RegExp;
  replacement: string | ReplaceFunction;
}

export type ReplaceImageConfig = (ReplaceImageEntry | ReplaceFunction)[];

export interface ResolvedReplaceFunction {
  replaceFunction: ReplaceFunction;
  label: string;
}

export interface ResolvedReplaceImageEntry {
  source: string;
  replacement: string | ResolvedReplaceFunction;
}

export type ResolvedReplaceImageConfig = (
  | ResolvedReplaceImageEntry
  | ResolvedReplaceFunction
)[];

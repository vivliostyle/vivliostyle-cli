/**
 * Access to the image being replaced. Only valid while the ReplaceFunction
 * invocation is running; do not retain it beyond the callback.
 */
export interface ImageContext {
  asPNG(): Uint8Array;
}

export type ReplaceFunction = (
  image: ImageContext,
) => Uint8Array | null | Promise<Uint8Array | null>;

export interface ReplaceImageEntry {
  source: string;
  replacement: string | ReplaceFunction;
}

export type ReplaceImageConfigItem = ReplaceImageEntry | ReplaceFunction;
export type ReplaceImageConfig = ReplaceImageConfigItem[];

import type { CMYKValue } from '../global-viewer.js';

/**
 * Converts an unmapped RGB color on a 0-10000 scale to CMYK, or returns `null`
 * to leave it unmapped.
 */
export type CmykConvertFunction = (rgb: {
  r: number;
  g: number;
  b: number;
}) => CMYKValue | null | Promise<CMYKValue | null>;

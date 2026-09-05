import type { CmykConfig, RGBValue } from '../config/resolve.js';
import {
  type CmykConvertFunction,
  isValidCMYKValue,
} from '../config/schema.js';
import type { CMYKValue } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { tokenize, type OperatorToken } from './pdf-stream.js';
import type { PdfEditHook } from './pdf-visitor.js';

/**
 * `SRGBValue.MAX`
 * @see https://github.com/vivliostyle/vivliostyle.js/blob/master/packages/core/src/vivliostyle/cmyk-store.ts
 */
const SRGB_MAX = 10000;
/**
 * `CMYKValue.MAX`
 * @see https://github.com/vivliostyle/vivliostyle.js/blob/master/packages/core/src/vivliostyle/cmyk-store.ts
 */
const CMYK_MAX = 10000;

function createColorConverter(
  colorMap: ReadonlyMap<string, CMYKValue>,
  fallback: CmykConvertFunction | undefined,
): CmykConvertFunction {
  if (!fallback) {
    return (rgb) => colorMap.get(JSON.stringify([rgb.r, rgb.g, rgb.b])) ?? null;
  }

  return async (rgb) => {
    const key = JSON.stringify([rgb.r, rgb.g, rgb.b]);
    const mapped = colorMap.get(key);
    if (mapped !== undefined) {
      return mapped;
    }

    const converted = await fallback(rgb);
    if (converted !== null && !isValidCMYKValue(converted)) {
      throw new TypeError(
        `Invalid fallback conversion result: ${JSON.stringify(converted)}`,
      );
    }
    return converted;
  };
}

/**
 * Convert RGB color operators to CMYK in a content stream
 */
async function convertColors(
  content: string,
  convert: CmykConvertFunction,
  unmappedColors: Set<string> | null,
): Promise<string> {
  const result: string[] = [];
  const pendingNumbers: { value: number; raw: string }[] = [];

  const flushPendingNumbers = () => {
    for (const num of pendingNumbers) {
      result.push(num.raw);
    }
    pendingNumbers.length = 0;
  };

  const convertRgbOperator = async (
    cmykOp: 'k' | 'K',
    token: OperatorToken,
  ): Promise<void> => {
    const b = pendingNumbers.pop();
    const g = pendingNumbers.pop();
    const r = pendingNumbers.pop();
    /* v8 ignore next 3 */
    if (!b || !g || !r) {
      throw new Error('Expected at least three pending numbers for RGB color');
    }
    flushPendingNumbers();

    const rgb: RGBValue = {
      r: Math.round(r.value * SRGB_MAX),
      g: Math.round(g.value * SRGB_MAX),
      b: Math.round(b.value * SRGB_MAX),
    };
    const isOutOfRange = [rgb.r, rgb.g, rgb.b].some(
      (channel) => channel < 0 || channel > SRGB_MAX,
    );
    const cmyk = isOutOfRange ? null : await convert(rgb);

    if (!cmyk) {
      result.push(r.raw, g.raw, b.raw, token.raw);
      if (unmappedColors !== null) {
        unmappedColors.add(JSON.stringify(rgb));
      }
      return;
    }
    const c = (cmyk.c / CMYK_MAX).toString();
    const m = (cmyk.m / CMYK_MAX).toString();
    const y = (cmyk.y / CMYK_MAX).toString();
    const k = (cmyk.k / CMYK_MAX).toString();
    result.push(`${c} ${m} ${y} ${k} ${cmykOp}`);
  };

  for (const token of tokenize(content)) {
    if (token.type === 'number') {
      pendingNumbers.push({ value: token.value, raw: token.raw });
    } else if (token.type === 'operator') {
      const op = token.value;

      // RGB color: r g b rg (non-stroking) or r g b RG (stroking)
      const cmykOp = op === 'rg' ? 'k' : op === 'RG' ? 'K' : null;
      if (cmykOp && pendingNumbers.length >= 3) {
        await convertRgbOperator(cmykOp, token);
      } else {
        flushPendingNumbers();
        result.push(token.raw);
      }
    } else {
      // Other token types - flush pending numbers and pass through
      flushPendingNumbers();
      result.push(token.raw);
    }
  }

  // Flush any remaining pending numbers
  flushPendingNumbers();

  return result.join(' ');
}

export function createCmykColorHook(
  colorMap: ReadonlyMap<string, CMYKValue>,
  fallback: CmykConvertFunction | undefined,
  ifUnmappedColorsFound: CmykConfig['ifUnmappedColorsFound'],
  failures: string[],
): PdfEditHook {
  const convert = createColorConverter(colorMap, fallback);
  const unmappedColors =
    ifUnmappedColorsFound === 'ignore' ? null : new Set<string>();
  return {
    async visit(node) {
      if (node.kind !== 'content-stream') {
        return;
      }
      const converted = await convertColors(
        node.read(),
        convert,
        unmappedColors,
      );
      node.write(converted);
    },
    complete() {
      if (!unmappedColors) {
        return;
      }
      for (const color of unmappedColors) {
        Logger.logWarn(`RGB color not mapped to CMYK: ${color}`);
      }
      if (unmappedColors.size > 0 && ifUnmappedColorsFound === 'error') {
        failures.push(`${unmappedColors.size} RGB color(s) not mapped to CMYK`);
      }
    },
  };
}

import type { CmykConfig } from '../config/resolve.js';
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

function formatRgbKey(r: number, g: number, b: number): string {
  const ri = Math.round(r * SRGB_MAX);
  const gi = Math.round(g * SRGB_MAX);
  const bi = Math.round(b * SRGB_MAX);
  return JSON.stringify([ri, gi, bi]);
}

function formatUnmappedRgbKey(r: number, g: number, b: number): string {
  const ri = Math.round(r * SRGB_MAX);
  const gi = Math.round(g * SRGB_MAX);
  const bi = Math.round(b * SRGB_MAX);
  return JSON.stringify({ r: ri, g: gi, b: bi });
}

/**
 * Convert RGB color operators to CMYK in a content stream
 */
function convertColors(
  content: string,
  colorMap: ReadonlyMap<string, CMYKValue>,
  unmappedColors: Set<string> | null,
): string {
  const result: string[] = [];
  const pendingNumbers: { value: number; raw: string }[] = [];

  const flushPendingNumbers = () => {
    for (const num of pendingNumbers) {
      result.push(num.raw);
    }
    pendingNumbers.length = 0;
  };

  const convertRgbOperator = (
    cmykOp: 'k' | 'K',
    token: OperatorToken,
  ): void => {
    const b = pendingNumbers.pop();
    const g = pendingNumbers.pop();
    const r = pendingNumbers.pop();
    /* v8 ignore next 3 */
    if (!b || !g || !r) {
      throw new Error('Expected at least three pending numbers for RGB color');
    }
    flushPendingNumbers();

    const key = formatRgbKey(r.value, g.value, b.value);
    const cmyk = colorMap.get(key);

    if (!cmyk) {
      result.push(r.raw, g.raw, b.raw, token.raw);
      if (unmappedColors !== null) {
        unmappedColors.add(formatUnmappedRgbKey(r.value, g.value, b.value));
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
        convertRgbOperator(cmykOp, token);
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
  ifUnmappedColorsFound: CmykConfig['ifUnmappedColorsFound'],
  failures: string[],
): PdfEditHook {
  const unmappedColors =
    ifUnmappedColorsFound === 'ignore' ? null : new Set<string>();
  return {
    visit(node) {
      if (node.kind !== 'content-stream') {
        return;
      }
      const converted = convertColors(node.read(), colorMap, unmappedColors);
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

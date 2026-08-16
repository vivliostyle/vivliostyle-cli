import type { CmykConvertFunction, RGBValue } from '../config/resolve.js';
import { isValidCMYKValue } from '../config/schema.js';
import type { CMYKValue, CmykMap } from '../global-viewer.js';
import { Logger } from '../logger.js';

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

interface NumberToken {
  type: 'number';
  value: number;
  raw: string;
}

interface OperatorToken {
  type: 'operator';
  value: string;
  raw: string;
}

interface OtherToken {
  type: 'other';
  raw: string;
}

type Token = NumberToken | OperatorToken | OtherToken;

function scanStringLiteral(
  content: string,
  start: number,
): { str: string; next: number } {
  const len = content.length;
  let depth = 1;
  let str = '(';
  let i = start + 1;
  while (i < len && depth > 0) {
    if (content[i] === '\\' && i + 1 < len) {
      str += content[i] + content[i + 1];
      i += 2;
      continue;
    }
    if (content[i] === '(') {
      depth++;
    } else if (content[i] === ')') {
      depth--;
    }
    str += content[i];
    i++;
  }
  return { str, next: i };
}

/**
 * Tokenize PDF content stream
 */
function* tokenize(content: string): Generator<Token> {
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/v.test(content[i])) {
      i++;
    }
    if (i >= len) {
      break;
    }

    const c = content[i];

    // Comment - skip to end of line
    if (c === '%') {
      const start = i;
      while (i < len && content[i] !== '\n' && content[i] !== '\r') {
        i++;
      }
      yield { type: 'other', raw: content.slice(start, i) };
      continue;
    }

    // String literal (...) - must skip properly to avoid parsing numbers inside
    if (c === '(') {
      const scanned = scanStringLiteral(content, i);
      i = scanned.next;
      yield { type: 'other', raw: scanned.str };
      continue;
    }

    // Hex string <...> - must skip properly to avoid parsing numbers inside
    if (c === '<' && content[i + 1] !== '<') {
      let str = '<';
      i++;
      while (i < len && content[i] !== '>') {
        str += content[i];
        i++;
      }
      if (i < len) {
        str += '>';
        i++;
      }
      yield { type: 'other', raw: str };
      continue;
    }

    // Single character delimiters
    if (c === '[' || c === ']' || c === '{' || c === '}') {
      yield { type: 'other', raw: c };
      i++;
      continue;
    }

    // Dictionary << ... >>
    if (c === '<' && content[i + 1] === '<') {
      yield { type: 'other', raw: '<<' };
      i += 2;
      continue;
    }
    if (c === '>' && content[i + 1] === '>') {
      yield { type: 'other', raw: '>>' };
      i += 2;
      continue;
    }

    // Name /...
    if (c === '/') {
      let name = '/';
      i++;
      while (i < len && /[^\s\[\]\(\)<>\{\}\/%]/v.test(content[i])) {
        name += content[i];
        i++;
      }
      yield { type: 'other', raw: name };
      continue;
    }

    // Number or operator
    let token = '';
    while (i < len && /[^\s\[\]\(\)<>\{\}\/%]/v.test(content[i])) {
      token += content[i];
      i++;
    }

    if (/^[+\-]?(\d+\.?\d*|\.\d+)$/v.test(token)) {
      yield { type: 'number', value: Number.parseFloat(token), raw: token };
    } else if (token === 'ID') {
      // Inline image: ID is followed by single whitespace, then binary data until EI
      yield { type: 'operator', value: 'ID', raw: 'ID' };

      // Read binary data until whitespace + EI + (whitespace or EOF)
      const dataStart = i;
      while (i < len) {
        if (
          /\s/v.test(content[i]) &&
          content[i + 1] === 'E' &&
          content[i + 2] === 'I' &&
          (i + 3 >= len || /\s/v.test(content[i + 3]))
        ) {
          // Emit binary data including trailing whitespace before EI
          yield { type: 'other', raw: content.slice(dataStart, i + 1) };
          yield { type: 'operator', value: 'EI', raw: 'EI' };
          i += 3;
          break;
        }
        i++;
      }
    } else if (token.length > 0) {
      yield { type: 'operator', value: token, raw: token };
    }
  }
}

export function mapToConverter(map: CmykMap): CmykConvertFunction {
  return (rgb) => map[JSON.stringify([rgb.r, rgb.g, rgb.b])] ?? null;
}

export function guardConvertFunction(
  fn: CmykConvertFunction,
): CmykConvertFunction {
  const warnedErrors = new Set<string>();
  const warnOnce = (message: string) => {
    if (!warnedErrors.has(message)) {
      warnedErrors.add(message);
      Logger.logWarn(message);
    }
  };
  return async (rgb) => {
    try {
      const value = await fn(rgb);
      if (value === null) {
        return null;
      }
      if (!isValidCMYKValue(value)) {
        warnOnce(
          `Invalid fallback conversion result: ${JSON.stringify(value)}`,
        );
        return null;
      }
      return value;
    } catch (error) {
      warnOnce(`Failed to apply fallback conversion: ${String(error)}`);
      return null;
    }
  };
}

export function composeColorConverters(
  converters: CmykConvertFunction[],
): CmykConvertFunction {
  const cache = new Map<string, CMYKValue | null>();
  return async (rgb) => {
    const key = JSON.stringify([rgb.r, rgb.g, rgb.b]);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let result: CMYKValue | null = null;
    for (const convert of converters) {
      result = await convert(rgb);
      if (result !== null) {
        break;
      }
    }
    cache.set(key, result);
    return result;
  };
}

/**
 * Convert RGB color operators to CMYK in a content stream
 */
export async function convertStreamColors(
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
    if (
      [rgb.r, rgb.g, rgb.b].some((channel) => channel < 0 || channel > SRGB_MAX)
    ) {
      result.push(r.raw, g.raw, b.raw, token.raw);
      unmappedColors?.add(JSON.stringify(rgb));
      return;
    }
    const cmyk = await convert(rgb);

    if (cmyk) {
      const c = (cmyk.c / CMYK_MAX).toString();
      const m = (cmyk.m / CMYK_MAX).toString();
      const y = (cmyk.y / CMYK_MAX).toString();
      const k = (cmyk.k / CMYK_MAX).toString();
      result.push(`${c} ${m} ${y} ${k} ${cmykOp}`);
      return;
    }
    result.push(r.raw, g.raw, b.raw, token.raw);
    unmappedColors?.add(JSON.stringify(rgb));
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

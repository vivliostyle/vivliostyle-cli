import { CMYK_MAX, SRGB_MAX, type CmykMap } from '../global-viewer.js';
import { Logger } from '../logger.js';

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

/**
 * Tokenize PDF content stream
 */
function* tokenize(content: string): Generator<Token> {
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(content[i])) i++;
    if (i >= len) break;

    const c = content[i];

    // Comment - skip to end of line
    if (c === '%') {
      const start = i;
      while (i < len && content[i] !== '\n' && content[i] !== '\r') i++;
      yield { type: 'other', raw: content.slice(start, i) };
      continue;
    }

    // String literal (...) - must skip properly to avoid parsing numbers inside
    if (c === '(') {
      let depth = 1;
      let str = '(';
      i++;
      while (i < len && depth > 0) {
        if (content[i] === '\\' && i + 1 < len) {
          str += content[i] + content[i + 1];
          i += 2;
        } else {
          if (content[i] === '(') depth++;
          else if (content[i] === ')') depth--;
          str += content[i];
          i++;
        }
      }
      yield { type: 'other', raw: str };
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
      while (i < len && /[^\s\[\]()<>{}/%]/.test(content[i])) {
        name += content[i];
        i++;
      }
      yield { type: 'other', raw: name };
      continue;
    }

    // Number or operator
    let token = '';
    while (i < len && /[^\s\[\]()<>{}/%]/.test(content[i])) {
      token += content[i];
      i++;
    }

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
      yield { type: 'number', value: parseFloat(token), raw: token };
    } else if (token === 'ID') {
      // Inline image: ID is followed by single whitespace, then binary data until EI
      yield { type: 'operator', value: 'ID', raw: 'ID' };

      // Read binary data until whitespace + EI + (whitespace or EOF)
      const dataStart = i;
      while (i < len) {
        if (
          /\s/.test(content[i]) &&
          content[i + 1] === 'E' &&
          content[i + 2] === 'I' &&
          (i + 3 >= len || /\s/.test(content[i + 3]))
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

function formatRgbKey(r: number, g: number, b: number): string {
  const ri = Math.round(r * SRGB_MAX);
  const gi = Math.round(g * SRGB_MAX);
  const bi = Math.round(b * SRGB_MAX);
  return JSON.stringify([ri, gi, bi]);
}

function formatRgbKeyForWarning(r: number, g: number, b: number): string {
  const ri = Math.round(r * SRGB_MAX);
  const gi = Math.round(g * SRGB_MAX);
  const bi = Math.round(b * SRGB_MAX);
  return JSON.stringify({ r: ri, g: gi, b: bi });
}

/**
 * Convert RGB color operators to CMYK in a content stream
 */
export function convertStreamColors(
  content: string,
  colorMap: CmykMap,
  warnUnmapped: boolean,
  warnedColors: Set<string>,
): string {
  const result: string[] = [];
  const pendingNumbers: { value: number; raw: string }[] = [];

  const flushPendingNumbers = () => {
    for (const num of pendingNumbers) {
      result.push(num.raw);
    }
    pendingNumbers.length = 0;
  };

  for (const token of tokenize(content)) {
    if (token.type === 'number') {
      pendingNumbers.push({ value: token.value, raw: token.raw });
    } else if (token.type === 'operator') {
      const op = token.value;

      // RGB color: r g b rg (non-stroking) or r g b RG (stroking)
      const cmykOp = op === 'rg' ? 'k' : op === 'RG' ? 'K' : null;
      if (cmykOp && pendingNumbers.length >= 3) {
        const b = pendingNumbers.pop()!;
        const g = pendingNumbers.pop()!;
        const r = pendingNumbers.pop()!;
        flushPendingNumbers();

        const key = formatRgbKey(r.value, g.value, b.value);
        const cmyk = colorMap[key];

        if (cmyk) {
          const c = (cmyk.c / CMYK_MAX).toString();
          const m = (cmyk.m / CMYK_MAX).toString();
          const y = (cmyk.y / CMYK_MAX).toString();
          const k = (cmyk.k / CMYK_MAX).toString();
          result.push(`${c} ${m} ${y} ${k} ${cmykOp}`);
        } else {
          result.push(r.raw, g.raw, b.raw, token.raw);
          if (warnUnmapped) {
            const warnKey = formatRgbKeyForWarning(r.value, g.value, b.value);
            if (!warnedColors.has(warnKey)) {
              warnedColors.add(warnKey);
              Logger.logWarn(`RGB color not mapped to CMYK: ${warnKey}`);
            }
          }
        }
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

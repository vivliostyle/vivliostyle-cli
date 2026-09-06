export interface NumberToken {
  type: 'number';
  value: number;
  raw: string;
}

export interface OperatorToken {
  type: 'operator';
  value: string;
  raw: string;
}

export interface OtherToken {
  type: 'other';
  raw: string;
}

export type Token = NumberToken | OperatorToken | OtherToken;

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
export function* tokenize(content: string): Generator<Token> {
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

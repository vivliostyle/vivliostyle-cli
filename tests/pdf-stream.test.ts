import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { convertStreamColors } from '../src/output/pdf-stream.js';
import type { CmykMap } from '../src/global-viewer.js';

/**
 * Helper to create a color map from RGB (0-10000 scale) to CMYK values
 */
function createColorMap(
  entries: [
    number,
    number,
    number,
    { c: number; m: number; y: number; k: number },
  ][],
): CmykMap {
  const map: CmykMap = {};
  for (const [r, g, b, cmyk] of entries) {
    const key = JSON.stringify([r, g, b]);
    map[key] = cmyk;
  }
  return map;
}

describe('convertStreamColors', () => {
  describe('RGB to CMYK conversion', () => {
    describe('rg operator (non-stroking)', () => {
      it('converts mapped RGB color to CMYK', () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = convertStreamColors(
          '0 0 0 rg',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k');
      });

      it('converts 50% gray correctly', () => {
        const colorMap = createColorMap([
          [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
        ]);
        const result = convertStreamColors(
          '0.5 0.5 0.5 rg',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 0.5 k');
      });

      it('preserves unmapped RGB colors', () => {
        const result = convertStreamColors(
          '0.1 0.2 0.3 rg',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('0.1 0.2 0.3 rg');
      });

      it('handles fractional CMYK values', () => {
        const colorMap = createColorMap([
          [5000, 3000, 2000, { c: 1234, m: 5678, y: 9012, k: 3456 }],
        ]);
        const result = convertStreamColors(
          '0.5 0.3 0.2 rg',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0.1234 0.5678 0.9012 0.3456 k');
      });

      it('handles insufficient arguments gracefully', () => {
        const result = convertStreamColors('0.5 0.5 rg', {}, false, new Set());
        expect(result).toBe('0.5 0.5 rg');
      });
    });

    describe('RG operator (stroking)', () => {
      it('converts mapped RGB stroking color to CMYK', () => {
        const colorMap = createColorMap([
          [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
        ]);
        const result = convertStreamColors(
          '1 0 0 RG',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0 1 1 0 K');
      });

      it('preserves unmapped RGB stroking colors', () => {
        const result = convertStreamColors(
          '0.9 0.8 0.7 RG',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('0.9 0.8 0.7 RG');
      });

      it('handles insufficient arguments gracefully', () => {
        const result = convertStreamColors('0.5 RG', {}, false, new Set());
        expect(result).toBe('0.5 RG');
      });
    });

    describe('mixed operators', () => {
      it('converts both rg and RG in same stream', () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = convertStreamColors(
          '0 0 0 rg 0 0 0 RG',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 1 K');
      });

      it('handles multiple color changes', () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
          [10000, 10000, 10000, { c: 0, m: 0, y: 0, k: 0 }],
        ]);
        const result = convertStreamColors(
          '0 0 0 rg 1 1 1 rg',
          colorMap,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 0 k');
      });
    });
  });

  describe('content preservation', () => {
    describe('existing CMYK and gray colors', () => {
      it('preserves k operator', () => {
        const result = convertStreamColors('0 0 0 1 k', {}, false, new Set());
        expect(result).toBe('0 0 0 1 k');
      });

      it('preserves K operator', () => {
        const result = convertStreamColors('1 0 0 0 K', {}, false, new Set());
        expect(result).toBe('1 0 0 0 K');
      });

      it('preserves g operator', () => {
        const result = convertStreamColors('0.5 g', {}, false, new Set());
        expect(result).toBe('0.5 g');
      });

      it('preserves G operator', () => {
        const result = convertStreamColors('0.5 G', {}, false, new Set());
        expect(result).toBe('0.5 G');
      });
    });

    describe('PDF operators', () => {
      it('preserves text operators', () => {
        const result = convertStreamColors(
          'BT /F1 12 Tf ET',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('BT /F1 12 Tf ET');
      });

      it('preserves path operators', () => {
        const result = convertStreamColors(
          '100 200 m 300 400 l S',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('100 200 m 300 400 l S');
      });

      it('preserves graphics state operators', () => {
        const result = convertStreamColors(
          'q 1 0 0 1 50 50 cm Q',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('q 1 0 0 1 50 50 cm Q');
      });
    });

    describe('PDF syntax elements', () => {
      it('preserves string literals', () => {
        const result = convertStreamColors(
          '(Hello World) Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('(Hello World) Tj');
      });

      it('preserves nested parentheses in strings', () => {
        const result = convertStreamColors(
          '(test (nested) string) Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('(test (nested) string) Tj');
      });

      it('preserves escaped characters in strings', () => {
        const result = convertStreamColors(
          '(line1\\nline2) Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('(line1\\nline2) Tj');
      });

      it('preserves escaped parentheses in strings', () => {
        const result = convertStreamColors(
          '(test\\(escaped\\)parens) Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('(test\\(escaped\\)parens) Tj');
      });

      it('preserves empty strings', () => {
        const result = convertStreamColors('() Tj', {}, false, new Set());
        expect(result).toBe('() Tj');
      });

      it('preserves hex strings', () => {
        const result = convertStreamColors(
          '<48454C4C4F> Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('<48454C4C4F> Tj');
      });

      it('preserves hex strings with spaces', () => {
        const result = convertStreamColors(
          '<48 65 6C 6C 6F> Tj',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('<48 65 6C 6C 6F> Tj');
      });

      it('preserves empty hex strings', () => {
        const result = convertStreamColors('<> Tj', {}, false, new Set());
        expect(result).toBe('<> Tj');
      });

      it('preserves names', () => {
        const result = convertStreamColors(
          '/DeviceCMYK cs',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('/DeviceCMYK cs');
      });

      it('preserves names with special characters', () => {
        const result = convertStreamColors(
          '/sRGB-IEC61966-2.1 cs',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('/sRGB-IEC61966-2.1 cs');
      });

      it('preserves inline dictionaries', () => {
        const result = convertStreamColors(
          '/Span << /MCID 0 >> BDC',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('/Span << /MCID 0 >> BDC');
      });

      it('distinguishes hex strings from dictionary markers', () => {
        const result = convertStreamColors(
          '<< /Key <ABCD> >>',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('<< /Key <ABCD> >>');
      });

      it('preserves arrays', () => {
        const result = convertStreamColors('[1 2 3] TJ', {}, false, new Set());
        expect(result).toBe('[ 1 2 3 ] TJ');
      });

      it('preserves comments', () => {
        const result = convertStreamColors(
          '% comment\n0.5 g',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('% comment 0.5 g');
      });
    });

    describe('number formats', () => {
      it('handles integers', () => {
        const result = convertStreamColors('42 g', {}, false, new Set());
        expect(result).toBe('42 g');
      });

      it('handles floating point numbers', () => {
        const result = convertStreamColors('3.14159 g', {}, false, new Set());
        expect(result).toBe('3.14159 g');
      });

      it('handles negative numbers', () => {
        const result = convertStreamColors('-123 0 m', {}, false, new Set());
        expect(result).toBe('-123 0 m');
      });

      it('handles positive numbers with explicit sign', () => {
        const result = convertStreamColors('+456 0 m', {}, false, new Set());
        expect(result).toBe('+456 0 m');
      });

      it('handles numbers starting with decimal point', () => {
        const result = convertStreamColors('.5 g', {}, false, new Set());
        expect(result).toBe('.5 g');
      });

      it('handles numbers ending with decimal point', () => {
        const result = convertStreamColors('5. g', {}, false, new Set());
        expect(result).toBe('5. g');
      });
    });

    describe('whitespace handling', () => {
      it('handles various whitespace characters', () => {
        const result = convertStreamColors(
          '1\t2\n3\r4 re',
          {},
          false,
          new Set(),
        );
        expect(result).toBe('1 2 3 4 re');
      });

      it('handles empty input', () => {
        const result = convertStreamColors('', {}, false, new Set());
        expect(result).toBe('');
      });

      it('handles whitespace-only input', () => {
        const result = convertStreamColors('   \t\n   ', {}, false, new Set());
        expect(result).toBe('');
      });
    });
  });

  describe('complex content streams', () => {
    it('converts colors within text block', () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = 'BT 0 0 0 rg /F1 12 Tf (Hello) Tj ET';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toBe('BT 0 0 0 1 k /F1 12 Tf (Hello) Tj ET');
    });

    it('converts colors within graphics state', () => {
      const colorMap = createColorMap([
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input = 'q 1 0 0 RG 100 100 200 200 re S Q';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toBe('q 0 1 1 0 K 100 100 200 200 re S Q');
    });

    it('handles multiple color changes with other operators', () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input =
        '0 0 0 rg 50 50 m 100 100 l S 1 0 0 rg 150 150 m 200 200 l S';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toBe(
        '0 0 0 1 k 50 50 m 100 100 l S 0 1 1 0 k 150 150 m 200 200 l S',
      );
    });

    it('handles Vivliostyle-generated content with BDC markers', () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input =
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 rg /F4 127 Tf ET EMC';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toBe(
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 1 k /F4 127 Tf ET EMC',
      );
    });

    it('handles crop marks with CMYK colors (no conversion needed)', () => {
      const input = 'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q';
      const result = convertStreamColors(input, {}, false, new Set());
      expect(result).toBe(
        'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q',
      );
    });

    it('handles ExtGState references', () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = '/G3 gs 0 0 0 rg';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toBe('/G3 gs 0 0 0 1 k');
    });
  });

  describe('warning for unmapped colors', () => {
    let logWarnMock: ReturnType<typeof vi.fn>;
    let originalLogWarn: typeof import('../src/logger.js').Logger.logWarn;

    beforeEach(async () => {
      const Logger = (await import('../src/logger.js')).Logger;
      originalLogWarn = Logger.logWarn;
      logWarnMock = vi.fn();
      Logger.logWarn = logWarnMock;
    });

    afterEach(async () => {
      const Logger = (await import('../src/logger.js')).Logger;
      Logger.logWarn = originalLogWarn;
    });

    it('warns for unmapped rg colors when warnUnmapped is true', () => {
      convertStreamColors('0.1 0.2 0.3 rg', {}, true, new Set());
      expect(logWarnMock).toHaveBeenCalledWith(
        'RGB color not mapped to CMYK: {"r":1000,"g":2000,"b":3000}',
      );
    });

    it('warns for unmapped RG colors when warnUnmapped is true', () => {
      convertStreamColors('0.1 0.2 0.3 RG', {}, true, new Set());
      expect(logWarnMock).toHaveBeenCalledWith(
        'RGB color not mapped to CMYK: {"r":1000,"g":2000,"b":3000}',
      );
    });

    it('does not warn when warnUnmapped is false', () => {
      convertStreamColors('0.1 0.2 0.3 rg', {}, false, new Set());
      expect(logWarnMock).not.toHaveBeenCalled();
    });

    it('warns only once for duplicate colors in same stream', () => {
      convertStreamColors('0.1 0.2 0.3 rg 0.1 0.2 0.3 rg', {}, true, new Set());
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });

    it('warns separately for different colors', () => {
      convertStreamColors('0.1 0.2 0.3 rg 0.4 0.5 0.6 rg', {}, true, new Set());
      expect(logWarnMock).toHaveBeenCalledTimes(2);
    });

    it('tracks warned colors across multiple calls', () => {
      const warnedColors = new Set<string>();
      convertStreamColors('0.1 0.2 0.3 rg', {}, true, warnedColors);
      convertStreamColors('0.1 0.2 0.3 rg', {}, true, warnedColors);
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });

    it('shares warned colors between rg and RG operators', () => {
      convertStreamColors('0.1 0.2 0.3 rg 0.1 0.2 0.3 RG', {}, true, new Set());
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('inline images', () => {
    it('skips binary data between ID and EI', () => {
      // Binary data could contain byte sequences that look like "0.5 0.5 0.5 rg"
      const input = 'BI /W 10 /H 10 ID binary0.5 0.5 0.5 rgdata EI';
      const result = convertStreamColors(input, {}, false, new Set());
      // The binary data should pass through unchanged
      expect(result).toContain('ID');
      expect(result).toContain('EI');
      expect(result).not.toContain('k'); // Should NOT convert the fake rg in binary
    });

    it('handles inline image followed by real color operator', () => {
      const colorMap = createColorMap([
        [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
      ]);
      const input = 'BI /W 1 /H 1 ID x EI 0.5 0.5 0.5 rg';
      const result = convertStreamColors(input, colorMap, false, new Set());
      expect(result).toContain('0 0 0 0.5 k');
    });

    it('handles inline image with EI-like bytes in data', () => {
      // "EI" without proper whitespace context should not end the image
      const input = 'BI /W 1 /H 1 ID xEIy EI';
      const result = convertStreamColors(input, {}, false, new Set());
      expect(result).toContain('EI');
    });
  });

  describe('edge cases', () => {
    it('handles negative color values (out of range)', () => {
      const result = convertStreamColors(
        '-0.1 0.2 0.3 rg',
        {},
        false,
        new Set(),
      );
      expect(result).toBe('-0.1 0.2 0.3 rg');
    });

    it('handles color values > 1 (out of range)', () => {
      const result = convertStreamColors(
        '1.5 0.5 0.5 rg',
        {},
        false,
        new Set(),
      );
      expect(result).toBe('1.5 0.5 0.5 rg');
    });

    it('handles rounding at color map boundaries', () => {
      // 0.12345 * 10000 = 1234.5 -> rounds to 1235
      const colorMap = createColorMap([
        [1235, 6789, 10000, { c: 1000, m: 2000, y: 3000, k: 4000 }],
      ]);
      const result = convertStreamColors(
        '0.12345 0.6789 0.99999 rg',
        colorMap,
        false,
        new Set(),
      );
      expect(result).toBe('0.1 0.2 0.3 0.4 k');
    });
  });
});

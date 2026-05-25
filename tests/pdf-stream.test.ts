import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  type InternalColorConverter,
  convertStreamColors,
} from '../src/output/pdf-stream.js';
import { mapToConverter } from '../src/output/cmyk.js';
import type { CmykMap } from '../src/global-viewer.js';

/**
 * Helper to create converters from RGB (0-10000 scale) to CMYK values
 */
function createConverters(
  entries: [
    number,
    number,
    number,
    { c: number; m: number; y: number; k: number },
  ][],
): InternalColorConverter[] {
  const map: CmykMap = {};
  for (const [r, g, b, cmyk] of entries) {
    const key = JSON.stringify([r, g, b]);
    map[key] = cmyk;
  }
  return [mapToConverter(map)];
}

describe('convertStreamColors', async () => {
  describe('RGB to CMYK conversion', async () => {
    describe('rg operator (non-stroking)', async () => {
      it('converts mapped RGB color to CMYK', async () => {
        const converters = createConverters([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertStreamColors(
          '0 0 0 rg',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k');
      });

      it('converts 50% gray correctly', async () => {
        const converters = createConverters([
          [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
        ]);
        const result = await convertStreamColors(
          '0.5 0.5 0.5 rg',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 0.5 k');
      });

      it('preserves unmapped RGB colors', async () => {
        const result = await convertStreamColors(
          '0.1 0.2 0.3 rg',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('0.1 0.2 0.3 rg');
      });

      it('handles fractional CMYK values', async () => {
        const converters = createConverters([
          [5000, 3000, 2000, { c: 1234, m: 5678, y: 9012, k: 3456 }],
        ]);
        const result = await convertStreamColors(
          '0.5 0.3 0.2 rg',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0.1234 0.5678 0.9012 0.3456 k');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertStreamColors(
          '0.5 0.5 rg',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('0.5 0.5 rg');
      });
    });

    describe('RG operator (stroking)', async () => {
      it('converts mapped RGB stroking color to CMYK', async () => {
        const converters = createConverters([
          [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
        ]);
        const result = await convertStreamColors(
          '1 0 0 RG',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0 1 1 0 K');
      });

      it('preserves unmapped RGB stroking colors', async () => {
        const result = await convertStreamColors(
          '0.9 0.8 0.7 RG',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('0.9 0.8 0.7 RG');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertStreamColors(
          '0.5 RG',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('0.5 RG');
      });
    });

    describe('mixed operators', async () => {
      it('converts both rg and RG in same stream', async () => {
        const converters = createConverters([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertStreamColors(
          '0 0 0 rg 0 0 0 RG',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 1 K');
      });

      it('handles multiple color changes', async () => {
        const converters = createConverters([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
          [10000, 10000, 10000, { c: 0, m: 0, y: 0, k: 0 }],
        ]);
        const result = await convertStreamColors(
          '0 0 0 rg 1 1 1 rg',
          converters,
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 0 k');
      });
    });
  });

  describe('content preservation', async () => {
    describe('existing CMYK and gray colors', async () => {
      it('preserves k operator', async () => {
        const result = await convertStreamColors(
          '0 0 0 1 k',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('0 0 0 1 k');
      });

      it('preserves K operator', async () => {
        const result = await convertStreamColors(
          '1 0 0 0 K',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('1 0 0 0 K');
      });

      it('preserves g operator', async () => {
        const result = await convertStreamColors('0.5 g', [], false, new Set());
        expect(result).toBe('0.5 g');
      });

      it('preserves G operator', async () => {
        const result = await convertStreamColors('0.5 G', [], false, new Set());
        expect(result).toBe('0.5 G');
      });
    });

    describe('PDF operators', async () => {
      it('preserves text operators', async () => {
        const result = await convertStreamColors(
          'BT /F1 12 Tf ET',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('BT /F1 12 Tf ET');
      });

      it('preserves path operators', async () => {
        const result = await convertStreamColors(
          '100 200 m 300 400 l S',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('100 200 m 300 400 l S');
      });

      it('preserves graphics state operators', async () => {
        const result = await convertStreamColors(
          'q 1 0 0 1 50 50 cm Q',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('q 1 0 0 1 50 50 cm Q');
      });
    });

    describe('PDF syntax elements', async () => {
      it('preserves string literals', async () => {
        const result = await convertStreamColors(
          '(Hello World) Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('(Hello World) Tj');
      });

      it('preserves nested parentheses in strings', async () => {
        const result = await convertStreamColors(
          '(test (nested) string) Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('(test (nested) string) Tj');
      });

      it('preserves escaped characters in strings', async () => {
        const result = await convertStreamColors(
          '(line1\\nline2) Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('(line1\\nline2) Tj');
      });

      it('preserves escaped parentheses in strings', async () => {
        const result = await convertStreamColors(
          '(test\\(escaped\\)parens) Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('(test\\(escaped\\)parens) Tj');
      });

      it('preserves empty strings', async () => {
        const result = await convertStreamColors('() Tj', [], false, new Set());
        expect(result).toBe('() Tj');
      });

      it('preserves hex strings', async () => {
        const result = await convertStreamColors(
          '<48454C4C4F> Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('<48454C4C4F> Tj');
      });

      it('preserves hex strings with spaces', async () => {
        const result = await convertStreamColors(
          '<48 65 6C 6C 6F> Tj',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('<48 65 6C 6C 6F> Tj');
      });

      it('preserves empty hex strings', async () => {
        const result = await convertStreamColors('<> Tj', [], false, new Set());
        expect(result).toBe('<> Tj');
      });

      it('preserves names', async () => {
        const result = await convertStreamColors(
          '/DeviceCMYK cs',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('/DeviceCMYK cs');
      });

      it('preserves names with special characters', async () => {
        const result = await convertStreamColors(
          '/sRGB-IEC61966-2.1 cs',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('/sRGB-IEC61966-2.1 cs');
      });

      it('preserves inline dictionaries', async () => {
        const result = await convertStreamColors(
          '/Span << /MCID 0 >> BDC',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('/Span << /MCID 0 >> BDC');
      });

      it('distinguishes hex strings from dictionary markers', async () => {
        const result = await convertStreamColors(
          '<< /Key <ABCD> >>',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('<< /Key <ABCD> >>');
      });

      it('preserves arrays', async () => {
        const result = await convertStreamColors(
          '[1 2 3] TJ',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('[ 1 2 3 ] TJ');
      });

      it('preserves comments', async () => {
        const result = await convertStreamColors(
          '% comment\n0.5 g',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('% comment 0.5 g');
      });
    });

    describe('number formats', async () => {
      it('handles integers', async () => {
        const result = await convertStreamColors('42 g', [], false, new Set());
        expect(result).toBe('42 g');
      });

      it('handles floating point numbers', async () => {
        const result = await convertStreamColors(
          '3.14159 g',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('3.14159 g');
      });

      it('handles negative numbers', async () => {
        const result = await convertStreamColors(
          '-123 0 m',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('-123 0 m');
      });

      it('handles positive numbers with explicit sign', async () => {
        const result = await convertStreamColors(
          '+456 0 m',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('+456 0 m');
      });

      it('handles numbers starting with decimal point', async () => {
        const result = await convertStreamColors('.5 g', [], false, new Set());
        expect(result).toBe('.5 g');
      });

      it('handles numbers ending with decimal point', async () => {
        const result = await convertStreamColors('5. g', [], false, new Set());
        expect(result).toBe('5. g');
      });
    });

    describe('whitespace handling', async () => {
      it('handles various whitespace characters', async () => {
        const result = await convertStreamColors(
          '1\t2\n3\r4 re',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('1 2 3 4 re');
      });

      it('handles empty input', async () => {
        const result = await convertStreamColors('', [], false, new Set());
        expect(result).toBe('');
      });

      it('handles whitespace-only input', async () => {
        const result = await convertStreamColors(
          '   \t\n   ',
          [],
          false,
          new Set(),
        );
        expect(result).toBe('');
      });
    });
  });

  describe('complex content streams', async () => {
    it('converts colors within text block', async () => {
      const converters = createConverters([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = 'BT 0 0 0 rg /F1 12 Tf (Hello) Tj ET';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toBe('BT 0 0 0 1 k /F1 12 Tf (Hello) Tj ET');
    });

    it('converts colors within graphics state', async () => {
      const converters = createConverters([
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input = 'q 1 0 0 RG 100 100 200 200 re S Q';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toBe('q 0 1 1 0 K 100 100 200 200 re S Q');
    });

    it('handles multiple color changes with other operators', async () => {
      const converters = createConverters([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input =
        '0 0 0 rg 50 50 m 100 100 l S 1 0 0 rg 150 150 m 200 200 l S';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toBe(
        '0 0 0 1 k 50 50 m 100 100 l S 0 1 1 0 k 150 150 m 200 200 l S',
      );
    });

    it('handles Vivliostyle-generated content with BDC markers', async () => {
      const converters = createConverters([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input =
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 rg /F4 127 Tf ET EMC';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toBe(
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 1 k /F4 127 Tf ET EMC',
      );
    });

    it('handles crop marks with CMYK colors (no conversion needed)', async () => {
      const input = 'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q';
      const result = await convertStreamColors(input, [], false, new Set());
      expect(result).toBe(
        'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q',
      );
    });

    it('handles ExtGState references', async () => {
      const converters = createConverters([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = '/G3 gs 0 0 0 rg';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toBe('/G3 gs 0 0 0 1 k');
    });
  });

  describe('warning for unmapped colors', async () => {
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

    it('warns for unmapped rg colors when warnUnmapped is true', async () => {
      await convertStreamColors('0.1 0.2 0.3 rg', [], true, new Set());
      expect(logWarnMock).toHaveBeenCalledWith(
        'RGB color not mapped to CMYK: {"r":1000,"g":2000,"b":3000}',
      );
    });

    it('warns for unmapped RG colors when warnUnmapped is true', async () => {
      await convertStreamColors('0.1 0.2 0.3 RG', [], true, new Set());
      expect(logWarnMock).toHaveBeenCalledWith(
        'RGB color not mapped to CMYK: {"r":1000,"g":2000,"b":3000}',
      );
    });

    it('does not warn when warnUnmapped is false', async () => {
      await convertStreamColors('0.1 0.2 0.3 rg', [], false, new Set());
      expect(logWarnMock).not.toHaveBeenCalled();
    });

    it('warns only once for duplicate colors in same stream', async () => {
      await convertStreamColors(
        '0.1 0.2 0.3 rg 0.1 0.2 0.3 rg',
        [],
        true,
        new Set(),
      );
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });

    it('warns separately for different colors', async () => {
      await convertStreamColors(
        '0.1 0.2 0.3 rg 0.4 0.5 0.6 rg',
        [],
        true,
        new Set(),
      );
      expect(logWarnMock).toHaveBeenCalledTimes(2);
    });

    it('tracks warned colors across multiple calls', async () => {
      const warnedColors = new Set<string>();
      await convertStreamColors('0.1 0.2 0.3 rg', [], true, warnedColors);
      await convertStreamColors('0.1 0.2 0.3 rg', [], true, warnedColors);
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });

    it('shares warned colors between rg and RG operators', async () => {
      await convertStreamColors(
        '0.1 0.2 0.3 rg 0.1 0.2 0.3 RG',
        [],
        true,
        new Set(),
      );
      expect(logWarnMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('inline images', async () => {
    it('skips binary data between ID and EI', async () => {
      // Binary data could contain byte sequences that look like "0.5 0.5 0.5 rg"
      const input = 'BI /W 10 /H 10 ID binary0.5 0.5 0.5 rgdata EI';
      const result = await convertStreamColors(input, [], false, new Set());
      // The binary data should pass through unchanged
      expect(result).toContain('ID');
      expect(result).toContain('EI');
      expect(result).not.toContain('k'); // Should NOT convert the fake rg in binary
    });

    it('handles inline image followed by real color operator', async () => {
      const converters = createConverters([
        [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
      ]);
      const input = 'BI /W 1 /H 1 ID x EI 0.5 0.5 0.5 rg';
      const result = await convertStreamColors(
        input,
        converters,
        false,
        new Set(),
      );
      expect(result).toContain('0 0 0 0.5 k');
    });

    it('handles inline image with EI-like bytes in data', async () => {
      // "EI" without proper whitespace context should not end the image
      const input = 'BI /W 1 /H 1 ID xEIy EI';
      const result = await convertStreamColors(input, [], false, new Set());
      expect(result).toContain('EI');
    });
  });

  describe('edge cases', async () => {
    it('handles negative color values (out of range)', async () => {
      const result = await convertStreamColors(
        '-0.1 0.2 0.3 rg',
        [],
        false,
        new Set(),
      );
      expect(result).toBe('-0.1 0.2 0.3 rg');
    });

    it('handles color values > 1 (out of range)', async () => {
      const result = await convertStreamColors(
        '1.5 0.5 0.5 rg',
        [],
        false,
        new Set(),
      );
      expect(result).toBe('1.5 0.5 0.5 rg');
    });

    it('handles rounding at color map boundaries', async () => {
      // 0.12345 * 10000 = 1234.5 -> rounds to 1235
      const converters = createConverters([
        [1235, 6789, 10000, { c: 1000, m: 2000, y: 3000, k: 4000 }],
      ]);
      const result = await convertStreamColors(
        '0.12345 0.6789 0.99999 rg',
        converters,
        false,
        new Set(),
      );
      expect(result).toBe('0.1 0.2 0.3 0.4 k');
    });
  });
});

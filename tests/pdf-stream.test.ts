import { describe, expect, it, vi } from 'vitest';

import type { CmykMap } from '../src/global-viewer.js';
import { Logger } from '../src/logger.js';
import type { InternalColorConverter } from '../src/output/pdf-stream.js';
import {
  composeColorConverters,
  convertStreamColors,
  guardConvertFunction,
  mapToConverter,
} from '../src/output/pdf-stream.js';

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

function convertWithMap(
  content: string,
  map: CmykMap,
  unmappedColors: Set<string> | null,
): Promise<string> {
  return convertStreamColors(content, mapToConverter(map), unmappedColors);
}

describe('convertStreamColors', () => {
  describe('RGB to CMYK conversion', () => {
    describe('rg operator (non-stroking)', () => {
      it('converts mapped RGB color to CMYK', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertWithMap('0 0 0 rg', colorMap, null);
        expect(result).toBe('0 0 0 1 k');
      });

      it('converts 50% gray correctly', async () => {
        const colorMap = createColorMap([
          [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
        ]);
        const result = await convertWithMap('0.5 0.5 0.5 rg', colorMap, null);
        expect(result).toBe('0 0 0 0.5 k');
      });

      it('preserves unmapped RGB colors', async () => {
        const result = await convertWithMap('0.1 0.2 0.3 rg', {}, null);
        expect(result).toBe('0.1 0.2 0.3 rg');
      });

      it('handles fractional CMYK values', async () => {
        const colorMap = createColorMap([
          [5000, 3000, 2000, { c: 1234, m: 5678, y: 9012, k: 3456 }],
        ]);
        const result = await convertWithMap('0.5 0.3 0.2 rg', colorMap, null);
        expect(result).toBe('0.1234 0.5678 0.9012 0.3456 k');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertWithMap('0.5 0.5 rg', {}, null);
        expect(result).toBe('0.5 0.5 rg');
      });
    });

    describe('RG operator (stroking)', () => {
      it('converts mapped RGB stroking color to CMYK', async () => {
        const colorMap = createColorMap([
          [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
        ]);
        const result = await convertWithMap('1 0 0 RG', colorMap, null);
        expect(result).toBe('0 1 1 0 K');
      });

      it('preserves unmapped RGB stroking colors', async () => {
        const result = await convertWithMap('0.9 0.8 0.7 RG', {}, null);
        expect(result).toBe('0.9 0.8 0.7 RG');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertWithMap('0.5 RG', {}, null);
        expect(result).toBe('0.5 RG');
      });
    });

    describe('mixed operators', () => {
      it('converts both rg and RG in same stream', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertWithMap(
          '0 0 0 rg 0 0 0 RG',
          colorMap,
          null,
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 1 K');
      });

      it('handles multiple color changes', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
          [10000, 10000, 10000, { c: 0, m: 0, y: 0, k: 0 }],
        ]);
        const result = await convertWithMap(
          '0 0 0 rg 1 1 1 rg',
          colorMap,
          null,
        );
        expect(result).toBe('0 0 0 1 k 0 0 0 0 k');
      });
    });
  });

  describe('content preservation', () => {
    describe('existing CMYK and gray colors', () => {
      it('preserves k operator', async () => {
        const result = await convertWithMap('0 0 0 1 k', {}, null);
        expect(result).toBe('0 0 0 1 k');
      });

      it('preserves K operator', async () => {
        const result = await convertWithMap('1 0 0 0 K', {}, null);
        expect(result).toBe('1 0 0 0 K');
      });

      it('preserves g operator', async () => {
        const result = await convertWithMap('0.5 g', {}, null);
        expect(result).toBe('0.5 g');
      });

      it('preserves G operator', async () => {
        const result = await convertWithMap('0.5 G', {}, null);
        expect(result).toBe('0.5 G');
      });
    });

    describe('PDF operators', () => {
      it('preserves text operators', async () => {
        const result = await convertWithMap('BT /F1 12 Tf ET', {}, null);
        expect(result).toBe('BT /F1 12 Tf ET');
      });

      it('preserves path operators', async () => {
        const result = await convertWithMap('100 200 m 300 400 l S', {}, null);
        expect(result).toBe('100 200 m 300 400 l S');
      });

      it('preserves graphics state operators', async () => {
        const result = await convertWithMap('q 1 0 0 1 50 50 cm Q', {}, null);
        expect(result).toBe('q 1 0 0 1 50 50 cm Q');
      });
    });

    describe('PDF syntax elements', () => {
      it('preserves string literals', async () => {
        const result = await convertWithMap('(Hello World) Tj', {}, null);
        expect(result).toBe('(Hello World) Tj');
      });

      it('preserves nested parentheses in strings', async () => {
        const result = await convertWithMap(
          '(test (nested) string) Tj',
          {},
          null,
        );
        expect(result).toBe('(test (nested) string) Tj');
      });

      it('preserves escaped characters in strings', async () => {
        const result = await convertWithMap('(line1\\nline2) Tj', {}, null);
        expect(result).toBe('(line1\\nline2) Tj');
      });

      it('preserves escaped parentheses in strings', async () => {
        const result = await convertWithMap(
          '(test\\(escaped\\)parens) Tj',
          {},
          null,
        );
        expect(result).toBe('(test\\(escaped\\)parens) Tj');
      });

      it('preserves empty strings', async () => {
        const result = await convertWithMap('() Tj', {}, null);
        expect(result).toBe('() Tj');
      });

      it('preserves hex strings', async () => {
        const result = await convertWithMap('<48454C4C4F> Tj', {}, null);
        expect(result).toBe('<48454C4C4F> Tj');
      });

      it('preserves hex strings with spaces', async () => {
        const result = await convertWithMap('<48 65 6C 6C 6F> Tj', {}, null);
        expect(result).toBe('<48 65 6C 6C 6F> Tj');
      });

      it('preserves empty hex strings', async () => {
        const result = await convertWithMap('<> Tj', {}, null);
        expect(result).toBe('<> Tj');
      });

      it('preserves names', async () => {
        const result = await convertWithMap('/DeviceCMYK cs', {}, null);
        expect(result).toBe('/DeviceCMYK cs');
      });

      it('preserves names with special characters', async () => {
        const result = await convertWithMap('/sRGB-IEC61966-2.1 cs', {}, null);
        expect(result).toBe('/sRGB-IEC61966-2.1 cs');
      });

      it('preserves inline dictionaries', async () => {
        const result = await convertWithMap(
          '/Span << /MCID 0 >> BDC',
          {},
          null,
        );
        expect(result).toBe('/Span << /MCID 0 >> BDC');
      });

      it('distinguishes hex strings from dictionary markers', async () => {
        const result = await convertWithMap('<< /Key <ABCD> >>', {}, null);
        expect(result).toBe('<< /Key <ABCD> >>');
      });

      it('preserves arrays', async () => {
        const result = await convertWithMap('[1 2 3] TJ', {}, null);
        expect(result).toBe('[ 1 2 3 ] TJ');
      });

      it('preserves comments', async () => {
        const result = await convertWithMap('% comment\n0.5 g', {}, null);
        expect(result).toBe('% comment 0.5 g');
      });
    });

    describe('number formats', () => {
      it('handles integers', async () => {
        const result = await convertWithMap('42 g', {}, null);
        expect(result).toBe('42 g');
      });

      it('handles floating point numbers', async () => {
        const result = await convertWithMap('3.14159 g', {}, null);
        expect(result).toBe('3.14159 g');
      });

      it('handles negative numbers', async () => {
        const result = await convertWithMap('-123 0 m', {}, null);
        expect(result).toBe('-123 0 m');
      });

      it('handles positive numbers with explicit sign', async () => {
        const result = await convertWithMap('+456 0 m', {}, null);
        expect(result).toBe('+456 0 m');
      });

      it('handles numbers starting with decimal point', async () => {
        const result = await convertWithMap('.5 g', {}, null);
        expect(result).toBe('.5 g');
      });

      it('handles numbers ending with decimal point', async () => {
        const result = await convertWithMap('5. g', {}, null);
        expect(result).toBe('5. g');
      });
    });

    describe('whitespace handling', () => {
      it('handles various whitespace characters', async () => {
        const result = await convertWithMap('1\t2\n3\r4 re', {}, null);
        expect(result).toBe('1 2 3 4 re');
      });

      it('handles empty input', async () => {
        const result = await convertWithMap('', {}, null);
        expect(result).toBe('');
      });

      it('handles whitespace-only input', async () => {
        const result = await convertWithMap('   \t\n   ', {}, null);
        expect(result).toBe('');
      });
    });
  });

  describe('complex content streams', () => {
    it('converts colors within text block', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = 'BT 0 0 0 rg /F1 12 Tf (Hello) Tj ET';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toBe('BT 0 0 0 1 k /F1 12 Tf (Hello) Tj ET');
    });

    it('converts colors within graphics state', async () => {
      const colorMap = createColorMap([
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input = 'q 1 0 0 RG 100 100 200 200 re S Q';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toBe('q 0 1 1 0 K 100 100 200 200 re S Q');
    });

    it('handles multiple color changes with other operators', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input =
        '0 0 0 rg 50 50 m 100 100 l S 1 0 0 rg 150 150 m 200 200 l S';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toBe(
        '0 0 0 1 k 50 50 m 100 100 l S 0 1 1 0 k 150 150 m 200 200 l S',
      );
    });

    it('handles Vivliostyle-generated content with BDC markers', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input =
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 rg /F4 127 Tf ET EMC';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toBe(
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 1 k /F4 127 Tf ET EMC',
      );
    });

    it('handles crop marks with CMYK colors (no conversion needed)', async () => {
      const input = 'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q';
      const result = await convertWithMap(input, {}, null);
      expect(result).toBe(
        'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q',
      );
    });

    it('handles ExtGState references', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = '/G3 gs 0 0 0 rg';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toBe('/G3 gs 0 0 0 1 k');
    });
  });

  describe('collecting unmapped colors', () => {
    it('collects unmapped rg colors', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 rg', {}, unmappedColors);
      expect([...unmappedColors]).toEqual(['{"r":1000,"g":2000,"b":3000}']);
    });

    it('collects unmapped RG colors', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 RG', {}, unmappedColors);
      expect([...unmappedColors]).toEqual(['{"r":1000,"g":2000,"b":3000}']);
    });

    it('does not collect when unmappedColors is null', async () => {
      const result = await convertWithMap('0.1 0.2 0.3 rg', {}, null);
      expect(result).toBe('0.1 0.2 0.3 rg');
    });

    it('collects each color once', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 rg 0.1 0.2 0.3 rg', {}, unmappedColors);
      expect(unmappedColors.size).toBe(1);
    });

    it('collects different colors separately', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 rg 0.4 0.5 0.6 rg', {}, unmappedColors);
      expect(unmappedColors.size).toBe(2);
    });

    it('deduplicates colors across multiple calls', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 rg', {}, unmappedColors);
      await convertWithMap('0.1 0.2 0.3 rg', {}, unmappedColors);
      expect(unmappedColors.size).toBe(1);
    });

    it('shares the collection between rg and RG operators', async () => {
      const unmappedColors = new Set<string>();
      await convertWithMap('0.1 0.2 0.3 rg 0.1 0.2 0.3 RG', {}, unmappedColors);
      expect(unmappedColors.size).toBe(1);
    });
  });

  describe('inline images', () => {
    it('skips binary data between ID and EI', async () => {
      // Binary data could contain byte sequences that look like "0.5 0.5 0.5 rg"
      const input = 'BI /W 10 /H 10 ID binary0.5 0.5 0.5 rgdata EI';
      const result = await convertWithMap(input, {}, null);
      // The binary data should pass through unchanged
      expect(result).toContain('ID');
      expect(result).toContain('EI');
      // Should NOT convert the fake rg in binary
      expect(result).not.toContain('k');
    });

    it('handles inline image followed by real color operator', async () => {
      const colorMap = createColorMap([
        [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
      ]);
      const input = 'BI /W 1 /H 1 ID x EI 0.5 0.5 0.5 rg';
      const result = await convertWithMap(input, colorMap, null);
      expect(result).toContain('0 0 0 0.5 k');
    });

    it('handles inline image with EI-like bytes in data', async () => {
      // "EI" without proper whitespace context should not end the image
      const input = 'BI /W 1 /H 1 ID xEIy EI';
      const result = await convertWithMap(input, {}, null);
      expect(result).toContain('EI');
    });
  });

  describe('edge cases', () => {
    it('handles negative color values (out of range)', async () => {
      const result = await convertWithMap('-0.1 0.2 0.3 rg', {}, null);
      expect(result).toBe('-0.1 0.2 0.3 rg');
    });

    it('handles color values > 1 (out of range)', async () => {
      const result = await convertWithMap('1.5 0.5 0.5 rg', {}, null);
      expect(result).toBe('1.5 0.5 0.5 rg');
    });

    it('handles rounding at color map boundaries', async () => {
      // 0.12345 * 10000 = 1234.5 -> rounds to 1235
      const colorMap = createColorMap([
        [1235, 6789, 10000, { c: 1000, m: 2000, y: 3000, k: 4000 }],
      ]);
      const result = await convertWithMap(
        '0.12345 0.6789 0.99999 rg',
        colorMap,
        null,
      );
      expect(result).toBe('0.1 0.2 0.3 0.4 k');
    });
  });
});

describe('mapToConverter', () => {
  it('converts mapped colors and returns null for missing ones', async () => {
    const convert = mapToConverter({
      '[0,0,0]': { c: 0, m: 0, y: 0, k: 10000 },
    });
    expect(await convert({ r: 0, g: 0, b: 0 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 10000,
    });
    expect(await convert({ r: 1, g: 2, b: 3 })).toBeNull();
  });
});

describe('composeColorConverters', () => {
  it('tries converters in order until one returns a value', async () => {
    const first = vi.fn<InternalColorConverter>().mockReturnValue(null);
    const second = vi
      .fn<InternalColorConverter>()
      .mockReturnValue({ c: 0, m: 0, y: 0, k: 10000 });
    const third = vi
      .fn<InternalColorConverter>()
      .mockReturnValue({ c: 10000, m: 0, y: 0, k: 0 });
    const convert = composeColorConverters([first, second, third]);

    expect(await convert({ r: 1, g: 2, b: 3 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 10000,
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
  });

  it('supports converters returning promises', async () => {
    const convert = composeColorConverters([
      () => Promise.resolve(null),
      () => Promise.resolve({ c: 0, m: 0, y: 0, k: 5000 }),
    ]);
    expect(await convert({ r: 1, g: 2, b: 3 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 5000,
    });
  });

  it('returns null when no converter handles the color', async () => {
    const convert = composeColorConverters([() => null]);
    expect(await convert({ r: 1, g: 2, b: 3 })).toBeNull();
  });

  it('caches the result per color', async () => {
    const fn = vi
      .fn<InternalColorConverter>()
      .mockReturnValue({ c: 0, m: 0, y: 0, k: 10000 });
    const miss = vi.fn<InternalColorConverter>().mockReturnValue(null);
    const convert = composeColorConverters([fn]);
    const convertMiss = composeColorConverters([miss]);

    await convert({ r: 1, g: 2, b: 3 });
    await convert({ r: 1, g: 2, b: 3 });
    await convert({ r: 4, g: 5, b: 6 });
    expect(fn).toHaveBeenCalledTimes(2);

    await convertMiss({ r: 1, g: 2, b: 3 });
    await convertMiss({ r: 1, g: 2, b: 3 });
    expect(miss).toHaveBeenCalledTimes(1);
  });
});

describe('guardConvertFunction', () => {
  it('passes through successful conversions', async () => {
    const convert = guardConvertFunction(() => ({ c: 0, m: 0, y: 0, k: 1 }));
    expect(await convert({ r: 1, g: 2, b: 3 })).toEqual({
      c: 0,
      m: 0,
      y: 0,
      k: 1,
    });
  });

  it('returns null and warns once per distinct error when the function throws', async () => {
    const spy = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
    const convert = guardConvertFunction(() => {
      throw new Error('conversion failed');
    });

    expect(await convert({ r: 1, g: 2, b: 3 })).toBeNull();
    expect(await convert({ r: 4, g: 5, b: 6 })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply overrideMap function'),
    );
    spy.mockRestore();
  });
});

describe('converter chain in convertStreamColors', () => {
  it('converts colors through a fallback function without collecting them as unmapped', async () => {
    const unmappedColors = new Set<string>();
    const result = await convertStreamColors(
      '0.1 0.2 0.3 rg',
      composeColorConverters([
        mapToConverter({}),
        () => ({ c: 0, m: 0, y: 0, k: 10000 }),
      ]),
      unmappedColors,
    );
    expect(result).toBe('0 0 0 1 k');
    expect(unmappedColors.size).toBe(0);
  });

  it('collects colors as unmapped when every converter declines', async () => {
    const unmappedColors = new Set<string>();
    const result = await convertStreamColors(
      '0.1 0.2 0.3 rg',
      composeColorConverters([mapToConverter({}), () => null]),
      unmappedColors,
    );
    expect(result).toBe('0.1 0.2 0.3 rg');
    expect(unmappedColors.size).toBe(1);
  });
});

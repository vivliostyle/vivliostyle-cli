import { describe, expect, it, vi } from 'vitest';

import type { CmykConvertFunction } from '../src/config/cmyk.js';
import type { CMYKValue } from '../src/global-viewer.js';
import { createCmykColorHook } from '../src/output/cmyk.js';
import type { PdfContentStreamNode } from '../src/output/pdf-visitor.js';

async function convertColors(
  content: string,
  colorMap: ReadonlyMap<string, CMYKValue>,
  fallback?: CmykConvertFunction,
): Promise<string> {
  let converted: string | undefined;
  const hook = createCmykColorHook(colorMap, fallback, 'ignore', []);
  await hook.visit?.({
    kind: 'content-stream',
    read: () => content,
    write: (value) => {
      converted = value;
    },
  } as PdfContentStreamNode);
  if (converted === undefined) {
    throw new Error('CMYK color hook did not write the content stream');
  }
  return converted;
}

async function reportUnmappedColors(...contents: string[]): Promise<string[]> {
  const failures: string[] = [];
  const hook = createCmykColorHook(new Map(), undefined, 'error', failures);
  for (const content of contents) {
    await hook.visit?.({
      kind: 'content-stream',
      read: () => content,
      write() {},
    } as unknown as PdfContentStreamNode);
  }
  await hook.complete?.(null as never);
  return failures;
}

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
): Map<string, CMYKValue> {
  const map = new Map<string, CMYKValue>();
  for (const [r, g, b, cmyk] of entries) {
    const key = JSON.stringify([r, g, b]);
    map.set(key, cmyk);
  }
  return map;
}

describe('convertColors', () => {
  describe('RGB to CMYK conversion', () => {
    describe('rg operator (non-stroking)', () => {
      it('converts mapped RGB color to CMYK', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertColors('0 0 0 rg', colorMap);
        expect(result).toBe('0 0 0 1 k');
      });

      it('converts 50% gray correctly', async () => {
        const colorMap = createColorMap([
          [5000, 5000, 5000, { c: 0, m: 0, y: 0, k: 5000 }],
        ]);
        const result = await convertColors('0.5 0.5 0.5 rg', colorMap);
        expect(result).toBe('0 0 0 0.5 k');
      });

      it('preserves unmapped RGB colors', async () => {
        const result = await convertColors('0.1 0.2 0.3 rg', new Map());
        expect(result).toBe('0.1 0.2 0.3 rg');
      });

      it('handles fractional CMYK values', async () => {
        const colorMap = createColorMap([
          [5000, 3000, 2000, { c: 1234, m: 5678, y: 9012, k: 3456 }],
        ]);
        const result = await convertColors('0.5 0.3 0.2 rg', colorMap);
        expect(result).toBe('0.1234 0.5678 0.9012 0.3456 k');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertColors('0.5 0.5 rg', new Map());
        expect(result).toBe('0.5 0.5 rg');
      });
    });

    describe('RG operator (stroking)', () => {
      it('converts mapped RGB stroking color to CMYK', async () => {
        const colorMap = createColorMap([
          [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
        ]);
        const result = await convertColors('1 0 0 RG', colorMap);
        expect(result).toBe('0 1 1 0 K');
      });

      it('preserves unmapped RGB stroking colors', async () => {
        const result = await convertColors('0.9 0.8 0.7 RG', new Map());
        expect(result).toBe('0.9 0.8 0.7 RG');
      });

      it('handles insufficient arguments gracefully', async () => {
        const result = await convertColors('0.5 RG', new Map());
        expect(result).toBe('0.5 RG');
      });
    });

    describe('mixed operators', () => {
      it('converts both rg and RG in same stream', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        ]);
        const result = await convertColors('0 0 0 rg 0 0 0 RG', colorMap);
        expect(result).toBe('0 0 0 1 k 0 0 0 1 K');
      });

      it('handles multiple color changes', async () => {
        const colorMap = createColorMap([
          [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
          [10000, 10000, 10000, { c: 0, m: 0, y: 0, k: 0 }],
        ]);
        const result = await convertColors('0 0 0 rg 1 1 1 rg', colorMap);
        expect(result).toBe('0 0 0 1 k 0 0 0 0 k');
      });
    });
  });

  describe('content preservation', () => {
    describe('existing CMYK and gray colors', () => {
      it('preserves k operator', async () => {
        const result = await convertColors('0 0 0 1 k', new Map());
        expect(result).toBe('0 0 0 1 k');
      });

      it('preserves K operator', async () => {
        const result = await convertColors('1 0 0 0 K', new Map());
        expect(result).toBe('1 0 0 0 K');
      });

      it('preserves g operator', async () => {
        const result = await convertColors('0.5 g', new Map());
        expect(result).toBe('0.5 g');
      });

      it('preserves G operator', async () => {
        const result = await convertColors('0.5 G', new Map());
        expect(result).toBe('0.5 G');
      });
    });

    describe('PDF operators', () => {
      it('preserves text operators', async () => {
        const result = await convertColors('BT /F1 12 Tf ET', new Map());
        expect(result).toBe('BT /F1 12 Tf ET');
      });

      it('preserves path operators', async () => {
        const result = await convertColors('100 200 m 300 400 l S', new Map());
        expect(result).toBe('100 200 m 300 400 l S');
      });

      it('preserves graphics state operators', async () => {
        const result = await convertColors('q 1 0 0 1 50 50 cm Q', new Map());
        expect(result).toBe('q 1 0 0 1 50 50 cm Q');
      });
    });

    describe('PDF syntax elements', () => {
      it('preserves string literals', async () => {
        const result = await convertColors('(Hello World) Tj', new Map());
        expect(result).toBe('(Hello World) Tj');
      });

      it('preserves nested parentheses in strings', async () => {
        const result = await convertColors(
          '(test (nested) string) Tj',
          new Map(),
        );
        expect(result).toBe('(test (nested) string) Tj');
      });

      it('preserves escaped characters in strings', async () => {
        const result = await convertColors('(line1\\nline2) Tj', new Map());
        expect(result).toBe('(line1\\nline2) Tj');
      });

      it('preserves escaped parentheses in strings', async () => {
        const result = await convertColors(
          '(test\\(escaped\\)parens) Tj',
          new Map(),
        );
        expect(result).toBe('(test\\(escaped\\)parens) Tj');
      });

      it('preserves empty strings', async () => {
        const result = await convertColors('() Tj', new Map());
        expect(result).toBe('() Tj');
      });

      it('preserves hex strings', async () => {
        const result = await convertColors('<48454C4C4F> Tj', new Map());
        expect(result).toBe('<48454C4C4F> Tj');
      });

      it('preserves hex strings with spaces', async () => {
        const result = await convertColors('<48 65 6C 6C 6F> Tj', new Map());
        expect(result).toBe('<48 65 6C 6C 6F> Tj');
      });

      it('preserves empty hex strings', async () => {
        const result = await convertColors('<> Tj', new Map());
        expect(result).toBe('<> Tj');
      });

      it('preserves names', async () => {
        const result = await convertColors('/DeviceCMYK cs', new Map());
        expect(result).toBe('/DeviceCMYK cs');
      });

      it('preserves names with special characters', async () => {
        const result = await convertColors('/sRGB-IEC61966-2.1 cs', new Map());
        expect(result).toBe('/sRGB-IEC61966-2.1 cs');
      });

      it('preserves inline dictionaries', async () => {
        const result = await convertColors(
          '/Span << /MCID 0 >> BDC',
          new Map(),
        );
        expect(result).toBe('/Span << /MCID 0 >> BDC');
      });

      it('distinguishes hex strings from dictionary markers', async () => {
        const result = await convertColors('<< /Key <ABCD> >>', new Map());
        expect(result).toBe('<< /Key <ABCD> >>');
      });

      it('preserves arrays', async () => {
        const result = await convertColors('[1 2 3] TJ', new Map());
        expect(result).toBe('[ 1 2 3 ] TJ');
      });

      it('preserves comments', async () => {
        const result = await convertColors('% comment\n0.5 g', new Map());
        expect(result).toBe('% comment 0.5 g');
      });
    });

    describe('number formats', () => {
      it('handles integers', async () => {
        const result = await convertColors('42 g', new Map());
        expect(result).toBe('42 g');
      });

      it('handles floating point numbers', async () => {
        const result = await convertColors('3.14159 g', new Map());
        expect(result).toBe('3.14159 g');
      });

      it('handles negative numbers', async () => {
        const result = await convertColors('-123 0 m', new Map());
        expect(result).toBe('-123 0 m');
      });

      it('handles positive numbers with explicit sign', async () => {
        const result = await convertColors('+456 0 m', new Map());
        expect(result).toBe('+456 0 m');
      });

      it('handles numbers starting with decimal point', async () => {
        const result = await convertColors('.5 g', new Map());
        expect(result).toBe('.5 g');
      });

      it('handles numbers ending with decimal point', async () => {
        const result = await convertColors('5. g', new Map());
        expect(result).toBe('5. g');
      });
    });

    describe('whitespace handling', () => {
      it('handles various whitespace characters', async () => {
        const result = await convertColors('1\t2\n3\r4 re', new Map());
        expect(result).toBe('1 2 3 4 re');
      });

      it('handles empty input', async () => {
        const result = await convertColors('', new Map());
        expect(result).toBe('');
      });

      it('handles whitespace-only input', async () => {
        const result = await convertColors('   \t\n   ', new Map());
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
      const result = await convertColors(input, colorMap);
      expect(result).toBe('BT 0 0 0 1 k /F1 12 Tf (Hello) Tj ET');
    });

    it('converts colors within graphics state', async () => {
      const colorMap = createColorMap([
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input = 'q 1 0 0 RG 100 100 200 200 re S Q';
      const result = await convertColors(input, colorMap);
      expect(result).toBe('q 0 1 1 0 K 100 100 200 200 re S Q');
    });

    it('handles multiple color changes with other operators', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
        [10000, 0, 0, { c: 0, m: 10000, y: 10000, k: 0 }],
      ]);
      const input =
        '0 0 0 rg 50 50 m 100 100 l S 1 0 0 rg 150 150 m 200 200 l S';
      const result = await convertColors(input, colorMap);
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
      const result = await convertColors(input, colorMap);
      expect(result).toBe(
        '/NonStruct << /MCID 0 >> BDC BT 0 0 0 1 k /F4 127 Tf ET EMC',
      );
    });

    it('handles crop marks with CMYK colors (no conversion needed)', async () => {
      const input = 'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q';
      const result = await convertColors(input, new Map());
      expect(result).toBe(
        'q 1 0 0 1 K 0 49.133858 m 37.795277 49.133858 l S Q',
      );
    });

    it('handles ExtGState references', async () => {
      const colorMap = createColorMap([
        [0, 0, 0, { c: 0, m: 0, y: 0, k: 10000 }],
      ]);
      const input = '/G3 gs 0 0 0 rg';
      const result = await convertColors(input, colorMap);
      expect(result).toBe('/G3 gs 0 0 0 1 k');
    });
  });

  describe('unmapped color reporting', () => {
    it('reports unmapped colors', async () => {
      expect(await reportUnmappedColors('0.1 0.2 0.3 rg')).toEqual([
        '1 RGB color(s) not mapped to CMYK',
      ]);
    });

    it('reports duplicate colors once', async () => {
      expect(
        await reportUnmappedColors('0.1 0.2 0.3 rg 0.1 0.2 0.3 rg'),
      ).toEqual(['1 RGB color(s) not mapped to CMYK']);
    });

    it('reports different colors separately', async () => {
      expect(
        await reportUnmappedColors('0.1 0.2 0.3 rg 0.4 0.5 0.6 rg'),
      ).toEqual(['2 RGB color(s) not mapped to CMYK']);
    });

    it('reports colors once across multiple visits', async () => {
      expect(
        await reportUnmappedColors('0.1 0.2 0.3 rg', '0.1 0.2 0.3 rg'),
      ).toEqual(['1 RGB color(s) not mapped to CMYK']);
    });

    it('reports a shared color once for rg and RG operators', async () => {
      expect(
        await reportUnmappedColors('0.1 0.2 0.3 rg 0.1 0.2 0.3 RG'),
      ).toEqual(['1 RGB color(s) not mapped to CMYK']);
    });
  });

  describe('fallback conversion', () => {
    it('does not cache unmapped colors without a fallback', async () => {
      const colorMap = new Map<string, CMYKValue>();
      const set = vi.spyOn(Map.prototype, 'set');

      try {
        const result = await convertColors('0.1 0.2 0.3 rg', colorMap);

        expect(result).toBe('0.1 0.2 0.3 rg');
        expect(set).not.toHaveBeenCalled();
      } finally {
        set.mockRestore();
      }
    });

    it('uses the color map without calling the fallback', async () => {
      const fallback = vi.fn<CmykConvertFunction>(() => ({
        c: 0,
        m: 0,
        y: 0,
        k: 5000,
      }));
      const colorMap = createColorMap([
        [1000, 2000, 3000, { c: 1000, m: 2000, y: 3000, k: 4000 }],
      ]);

      const result = await convertColors('0.1 0.2 0.3 rg', colorMap, fallback);

      expect(result).toBe('0.1 0.2 0.3 0.4 k');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('converts an unmapped color asynchronously', async () => {
      const fallback = vi.fn<CmykConvertFunction>().mockResolvedValue({
        c: 1000,
        m: 2000,
        y: 3000,
        k: 4000,
      });

      const result = await convertColors('0.1 0.2 0.3 RG', new Map(), fallback);

      expect(result).toBe('0.1 0.2 0.3 0.4 K');
      expect(fallback).toHaveBeenCalledWith({ r: 1000, g: 2000, b: 3000 });
    });

    it('rejects an invalid fallback result', async () => {
      const fallback: CmykConvertFunction = () => ({ c: -1, m: 0, y: 0, k: 0 });

      await expect(
        convertColors('0.1 0.2 0.3 rg 0.1 0.2 0.3 RG', new Map(), fallback),
      ).rejects.toThrow(
        'Invalid fallback conversion result: {"c":-1,"m":0,"y":0,"k":0}',
      );
    });

    it('propagates a fallback exception for an unmapped color', async () => {
      const fallback = vi.fn<CmykConvertFunction>(() => {
        throw new Error('conversion failed');
      });

      await expect(
        convertColors('0.1 0.2 0.3 rg', new Map(), fallback),
      ).rejects.toThrow('conversion failed');
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('does not pass out-of-range values to the fallback', async () => {
      const fallback = vi.fn<CmykConvertFunction>(() => ({
        c: 0,
        m: 0,
        y: 0,
        k: 0,
      }));

      const result = await convertColors(
        '-0.1 0.2 0.3 rg 1.5 0.5 0.5 RG',
        new Map(),
        fallback,
      );

      expect(result).toBe('-0.1 0.2 0.3 rg 1.5 0.5 0.5 RG');
      expect(fallback).not.toHaveBeenCalled();
    });
  });

  describe('inline images', () => {
    it('skips binary data between ID and EI', async () => {
      // Binary data could contain byte sequences that look like "0.5 0.5 0.5 rg"
      const input = 'BI /W 10 /H 10 ID binary0.5 0.5 0.5 rgdata EI';
      const result = await convertColors(input, new Map());
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
      const result = await convertColors(input, colorMap);
      expect(result).toContain('0 0 0 0.5 k');
    });

    it('handles inline image with EI-like bytes in data', async () => {
      // "EI" without proper whitespace context should not end the image
      const input = 'BI /W 1 /H 1 ID xEIy EI';
      const result = await convertColors(input, new Map());
      expect(result).toContain('EI');
    });
  });

  describe('edge cases', () => {
    it('handles negative color values (out of range)', async () => {
      const result = await convertColors('-0.1 0.2 0.3 rg', new Map());
      expect(result).toBe('-0.1 0.2 0.3 rg');
    });

    it('handles color values > 1 (out of range)', async () => {
      const result = await convertColors('1.5 0.5 0.5 rg', new Map());
      expect(result).toBe('1.5 0.5 0.5 rg');
    });

    it('handles rounding at color map boundaries', async () => {
      // 0.12345 * 10000 = 1234.5 -> rounds to 1235
      const colorMap = createColorMap([
        [1235, 6789, 10000, { c: 1000, m: 2000, y: 3000, k: 4000 }],
      ]);
      const result = await convertColors('0.12345 0.6789 0.99999 rg', colorMap);
      expect(result).toBe('0.1 0.2 0.3 0.4 k');
    });
  });
});

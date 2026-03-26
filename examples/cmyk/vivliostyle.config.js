// @ts-check
import { builtinGrayReplacement, defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  theme: './css',
  entry: ['README.md'],
  pdfPostprocess: {
    cmyk: {
      reserveMap: [
        ['#80ffff', { c: 5000, m: 0, y: 0, k: 0 }],
        ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
        ['#408080', { c: 5000, m: 0, y: 0, k: 5000 }],
      ],
      overrideMap: [
        [
          { r: 6039, g: 6039, b: 6039 },
          { c: 0, m: 0, y: 0, k: 10000 - 6039 },
        ],
        [
          { r: 9333, g: 9333, b: 9333 },
          { c: 0, m: 0, y: 0, k: 10000 - 9333 },
        ],
      ],
    },
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      builtinGrayReplacement(),
    ],
  },
});

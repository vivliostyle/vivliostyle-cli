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
        ['#2b2b2b', { c: 0, m: 0, y: 0, k: 8300 }],
        ['#9a9a9a', { c: 0, m: 0, y: 0, k: 4000 }],
        ['#eeeeee', { c: 0, m: 0, y: 0, k: 700 }],
      ],
    },
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      builtinGrayReplacement,
    ],
  },
});

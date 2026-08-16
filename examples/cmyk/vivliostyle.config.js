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
      fallback: ({ r, g, b }) => {
        /** @type {Record<number, number>} */
        const grayToK = { 1686: 8300, 6039: 4000, 9333: 700 };
        const k = r === g && g === b ? grayToK[r] : undefined;
        return k === undefined ? null : { c: 0, m: 0, y: 0, k };
      },
    },
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      builtinGrayReplacement(),
    ],
  },
});

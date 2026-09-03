// @ts-check
import { defineConfig } from '@vivliostyle/cli';

const grayToK = new Map([
  [1686, 8300],
  [6039, 4000],
  [9333, 700],
]);

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'error',
      reserveMap: [
        ['#80ffff', { c: 5000, m: 0, y: 0, k: 0 }],
        ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
        ['#408080', { c: 5000, m: 0, y: 0, k: 5000 }],
      ],
      fallback: ({ r, g, b }) => {
        const k = r === g && g === b ? grayToK.get(r) : undefined;
        return k === undefined ? null : { c: 0, m: 0, y: 0, k };
      },
    },
    replaceImage: [{ source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' }],
  },
});

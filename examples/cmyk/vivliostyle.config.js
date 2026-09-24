// @ts-check
import {
  createBuiltinGrayConversionReplacement,
  defineConfig,
} from '@vivliostyle/cli';

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
        if (r === 1686 && g === 1686 && b === 1686) {
          return { c: 0, m: 0, y: 0, k: 8300 };
        }
        return null;
      },
    },
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      createBuiltinGrayConversionReplacement(),
    ],
  },
});

// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      reserveMap: [
        ['#80ffff', { c: 5000, m: 0, y: 0, k: 0 }],
        ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
        ['#408080', { c: 5000, m: 0, y: 0, k: 5000 }],
      ],
    },
    replaceImage: [{ source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' }],
  },
});

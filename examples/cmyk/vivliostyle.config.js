// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      mapOutput: 'cmyk-map.json',
      overrideMap: [
        [
          { r: 5000, g: 3000, b: 2000 },
          { c: 0, m: 0, y: 0, k: 10000 },
        ],
        [
          { r: 0, g: 0, b: 0 },
          { c: 0, m: 0, y: 0, k: 10000 },
        ],
      ],
    },
    replaceImage: [{ source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' }],
  },
});

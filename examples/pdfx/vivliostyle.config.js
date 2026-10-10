// @ts-check
/** @import * as hast from 'hast' */
import { defineConfig, VFM } from '@vivliostyle/cli';
import { selectAll } from 'hast-util-select';

export default defineConfig({
  entry: ['manuscript.md'],
  theme: './style.css',
  documentProcessor: (options, metadata) =>
    VFM(options, metadata).use(() => (node) => {
      // PDF/X allows no Link annotations inside the printed area, and Chromium
      // writes one for every <a href>. A <span> keeps the text and the href
      // attribute, which style.css uses, without producing a link.
      selectAll('a', /** @type {hast.Root} */ (node)).forEach((element) => {
        element.tagName = 'span';
      });
    }),
  pdfPostprocess: {
    cmyk: true,
    outputIntent: './ps_cmyk.icc',
    pdfxLabel: 'X-4',
  },
  // To label the output as PDF/X-1a:2003 instead, replace pdfPostprocess
  // above with the following.
  // pdfPostprocess: {
  //   cmyk: true,
  //   outputIntent: './ps_cmyk.icc',
  //   pdfxLabel: 'X-1a:2003',
  // },
});

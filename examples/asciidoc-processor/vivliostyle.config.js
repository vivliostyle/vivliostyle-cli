// @ts-check
import { defineConfig } from '@vivliostyle/cli';
import Asciidoctor from '@asciidoctor/core';

// Note: Package versions must be compatible with VFM's dependencies (unified v9, hast v2).
// - rehype-stringify: v7 (v8 requires unified v10)
// - hast-util-from-html: v1 (v2 requires hast v3)
import unified from 'unified';
import rehypeStringify from 'rehype-stringify';
import { fromHtml } from 'hast-util-from-html';

const asciidoctor = Asciidoctor();
/** @type {import("@asciidoctor/core").ProcessorOptions} */
const asciidoctorOptions = {
  standalone: false,
  safe: 'safe',
  attributes: {
    showtitle: true,
  },
};

function createAsciidocProcessor() {
  return unified()
    .use(function () {
      Object.assign(this, {
        Parser: (/** @type {string} */ document) => {
          const html = asciidoctor
            .convert(document, asciidoctorOptions)
            .toString();
          return fromHtml(html);
        },
      });
    })
    .use(rehypeStringify);
}

/**
 * @param {string} content
 * @returns {import('@vivliostyle/vfm').Metadata}
 */
function readAsciidocMetadata(content) {
  const doc = asciidoctor.load(content, asciidoctorOptions);
  return {
    title: doc.getDocumentTitle()?.toString(),
  };
}

const config = defineConfig({
  title: 'Mixed Format Example',
  author: 'Vivliostyle',
  language: 'en',
  entry: [
    {
      path: 'chapter1.adoc',
      documentProcessor: () => createAsciidocProcessor(),
      documentMetadataReader: readAsciidocMetadata,
    },
    'chapter2.md',
  ],
  output: 'output.pdf',
});

export default config;

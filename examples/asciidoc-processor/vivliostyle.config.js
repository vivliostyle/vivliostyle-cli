import Asciidoctor from '@asciidoctor/core';

const asciidoctor = Asciidoctor();

/**
 * Create a unified-compatible processor that converts AsciiDoc to HTML
 * @returns {import('unified').Processor}
 */
function createAsciidocProcessor() {
  return {
    async process(file) {
      const content = String(file);
      const html = asciidoctor.convert(content, {
        standalone: false,
        safe: 'safe',
        attributes: {
          showtitle: true,
        },
      });
      file.contents = html;
      return file;
    },
  };
}

/**
 * Extract metadata from AsciiDoc content
 * @param {string} content
 * @returns {import('@vivliostyle/vfm').Metadata}
 */
function readAsciidocMetadata(content) {
  const doc = asciidoctor.load(content, { safe: 'safe' });
  return {
    title: doc.getDocumentTitle(),
  };
}

/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const config = {
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
};

export default config;

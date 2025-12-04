import { VFM } from '@vivliostyle/vfm';

/**
 * Rehype plugin that adds style="color:red" to all elements
 */
function rehypeRedText() {
  const addStyle = (node) => {
    if (node.type === 'element') {
      node.properties = node.properties || {};
      node.properties.style = 'color: red';
    }
    if (node.children) {
      node.children.forEach(addStyle);
    }
  };
  return addStyle;
}

/**
 * Custom processor that chains a rehype plugin to VFM
 * @param {import('@vivliostyle/vfm').StringifyMarkdownOptions} options
 * @param {import('@vivliostyle/vfm').Metadata} metadata
 */
function redTextProcessor(options, metadata) {
  return VFM(options, metadata).use(rehypeRedText);
}

/**
 * Custom metadata reader that returns a fixed title
 * @param {string} _content
 * @returns {import('@vivliostyle/vfm').Metadata}
 */
function customMetadataReader(_content) {
  return {
    title: 'Custom Title',
  };
}

/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const config = {
  title: 'Per-Entry Processor Example',
  language: 'en',
  entry: [
    // Custom documentProcessor only
    {
      path: 'chapter1.md',
      documentProcessor: redTextProcessor,
    },
    // Custom documentMetadataReader only
    {
      path: 'chapter2.md',
      documentMetadataReader: customMetadataReader,
    },
  ],
  output: 'output.pdf',
};

export default config;

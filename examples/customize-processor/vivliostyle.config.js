// @ts-check
import { defineConfig, VFM, defaultHtmlProcessor } from '@vivliostyle/cli';
import rehypeExpressiveCode from 'rehype-expressive-code';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remark2rehype from 'remark-rehype';
import remarkRuby from 'remark-ruby';
import unified from 'unified';
import { visit } from 'unist-util-visit';

/** @type {import('unified').Plugin} */
const openLinksInNewTab = () => (tree) => {
  visit(/** @type {import("hast-v2").Root} */ (tree), 'element', (node) => {
    if (
      node.tagName === 'a' &&
      String(node.properties?.href).startsWith('http')
    ) {
      (node.properties ??= {}).target = '_blank';
      node.properties.rel = 'noopener noreferrer';
      node.children.push({
        type: 'element',
        tagName: 'span',
        properties: {},
        children: [{ type: 'text', value: ' ↗' }],
      });
    }
  });
};

const config = defineConfig({
  title: 'Processor customization example',
  entry: [
    'manuscript.md',
    {
      path: 'manuscript2.md',
      documentProcessor: VFM,
      documentMetadataReader: (content) => {
        return { title: 'Custom title' };
      },
    },
    {
      path: 'page.html',
      htmlProcessor: (options) =>
        defaultHtmlProcessor(options).use(openLinksInNewTab),
    },
  ],
  documentProcessor: (config, metadata) =>
    unified()
      .use(remarkParse)
      .use(remarkRuby)
      .use(remark2rehype)
      .use(
        /**
         * rehype-expressive-code depends on unified@10 since its first release
         * and is not strictly type-compatible with unified@9.
         * It works at runtime anyway.
         * @type {import("unified").Plugin<[Parameters<typeof rehypeExpressiveCode>[0]]>}
         */ (rehypeExpressiveCode),
        {
          frames: { showCopyToClipboardButton: false },
        },
      )
      .use(rehypeStringify),
  output: 'draft.pdf',
});

export default config;

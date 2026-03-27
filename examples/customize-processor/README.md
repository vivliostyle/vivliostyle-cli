# Customize Unified Processor

You can use customized [unified](https://unifiedjs.com/) processor other than [VFM](https://github.com/vivliostyle/vfm) via `vivliostyle.config.js`.

## Global documentProcessor

Set a custom `documentProcessor` at the top level to apply it to all entries:

```js
import unified from 'unified';
import remarkParse from 'remark-parse';
import remark2rehype from 'remark-rehype';
import rehypeExpressiveCode from 'rehype-expressive-code';
import rehypeStringify from 'rehype-stringify';
import remarkRuby from 'remark-ruby';

const config = {
  title: 'Processor customization example',
  entry: ['manuscript.md'],
  // config is StringifyMarkdownOptions in @vivliostyle/vfm
  // metadata is Metadata in @vivliostyle/vfm
  // These types are re-exported from @vivliostyle/cli
  // Generated Unified processor should be able to process markdown into HTML
  documentProcessor: (config, metadata) =>
    unified()
      .use(remarkParse)
      .use(remarkRuby)
      .use(remark2rehype)
      .use(rehypeExpressiveCode, {
        frames: { showCopyToClipboardButton: false },
      })
      .use(rehypeStringify),
  output: 'draft.pdf',
};

export default config;
```

## Per-entry documentProcessor and documentMetadataReader

You can also set `documentProcessor` and `documentMetadataReader` for individual entries. This allows different processing for each file:

```js
import { defineConfig, VFM } from '@vivliostyle/cli';
import unified from 'unified';
// ... other imports

const config = defineConfig({
  title: 'Processor customization example',
  entry: [
    // Uses the global documentProcessor
    'manuscript.md',
    // Per-entry settings: use VFM with custom metadata reader
    {
      path: 'manuscript2.md',
      documentProcessor: VFM,
      documentMetadataReader: (content) => {
        return { title: 'Custom title' };
      },
    },
  ],
  // Global processor applied to entries without per-entry settings
  documentProcessor: (config, metadata) =>
    unified()
      .use(remarkParse)
      .use(remarkRuby)
      .use(remark2rehype)
      .use(rehypeExpressiveCode, {
        frames: { showCopyToClipboardButton: false },
      })
      .use(rehypeStringify),
  output: 'draft.pdf',
});

export default config;
```

## htmlProcessor and xhtmlProcessor

While `documentProcessor` handles Markdown-to-HTML conversion, `htmlProcessor` and `xhtmlProcessor` allow you to customize the processing of HTML and XHTML source files respectively.

You can extend the built-in `defaultHtmlProcessor` (or `defaultXhtmlProcessor` for XHTML) with additional [rehype](https://github.com/rehypejs/rehype) plugins:

```js
import { defineConfig, defaultHtmlProcessor } from '@vivliostyle/cli';
import { visit } from 'unist-util-visit';

const openLinksInNewTab = () => (tree) => {
  visit(tree, 'element', (node) => {
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
  entry: [
    {
      path: 'page.html',
      htmlProcessor: (options) =>
        defaultHtmlProcessor(options).use(openLinksInNewTab),
    },
  ],
});

export default config;
```

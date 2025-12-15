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
  title: 'Markdown processor customization example',
  entry: ['manuscript.md'],
  // config is StringifyMarkdownOptions in @vivliostyle/vfm
  // metadata is Metadata in @vivliostyle/vfm
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
import { defineConfig } from '@vivliostyle/cli';
import { VFM, readMetadata } from '@vivliostyle/vfm';
import unified from 'unified';
// ... other imports

const config = defineConfig({
  title: 'Markdown processor customization example',
  entry: [
    // Uses the global documentProcessor
    'manuscript.md',
    // Per-entry settings: use VFM with custom metadata reader
    {
      path: 'manuscript2.md',
      documentProcessor: VFM,
      documentMetadataReader: (content) => {
        const match = content.match(/^#\s+(.+)$/m);
        return { title: match ? match[1] : 'Untitled' };
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

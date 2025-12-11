// @ts-check
import { defineConfig } from '@vivliostyle/cli';
import { VFM } from '@vivliostyle/vfm';
import rehypeExpressiveCode from 'rehype-expressive-code';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remark2rehype from 'remark-rehype';
import remarkRuby from 'remark-ruby';
import unified from 'unified';

const config = defineConfig({
  title: 'Markdown processor customization example',
  entry: [
    'manuscript.md',
    {
      path: 'manuscript2.md',
      documentProcessor: VFM,
      documentMetadataReader: (content) => {
        return { title: 'Custom title' };
      },
    },
  ],
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

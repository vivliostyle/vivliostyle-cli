import unified from "unified"
import remarkParse from "remark-parse";
import remark2rehype from "remark-rehype";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeStringify from "rehype-stringify";
import remarkRuby from "remark-ruby"

/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const config = {
  title: 'Markdown processor customization example',
  entry: [
    'manuscript.md',
  ],
  documentProcessor: (config, metadata) => unified()
      .use(remarkParse)
      .use(remarkRuby)
      .use(remark2rehype)
      .use(rehypeExpressiveCode, {frames: {showCopyToClipboardButton: false}})
      .use(rehypeStringify),
  output: "draft.pdf"
}

export default config;

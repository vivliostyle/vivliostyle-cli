# Customize Unified Processor

You can use customized [unified](https://unifiedjs.com/) processor other than [VFM](https://github.com/vivliostyle/vfm) via `vivliostyle.config.js`.

```js
import unified from "unified"
import remarkParse from "remark-parse";
import remark2rehype from "remark-rehype";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeStringify from "rehype-stringify";
import remarkRuby from "remark-ruby"

const config = {
    title: 'Markdown processor customization example',
    entry: [
        'manuscript.md'
    ],
    // config is StringifyMarkdownOptions in @vivliostyle/vfm
    // metadata is Metadata in @vivliostyle/vfm
    // Generated Unified processor should be able to process markdown into HTML
    documentProcessor: (config, metadata) => unified()
        .use(remarkParse)
        .use(remarkRuby)
        .use(remark2rehype)
        .use(rehypeExpressiveCode, {frames: {showCopyToClipboardButton: false}})
        .use(rehypeStringify),
    output: "draft.pdf"
}

export default config;
```

# Multiple input and output

`vivliostyle.config.js` can be given multiple configurations in an array. In this example, Vivliostyle CLI converts all Markdown files in the `src` directory to PDF files of the same name.

### vivliostyle.config.js

```js
import { defineConfig } from '@vivliostyle/cli';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'output');
const files = fs.readdirSync(inputDir);

const vivliostyleConfig = defineConfig(
  files
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      title: `Article ${path.basename(name, '.md')}`,
      entry: name,
      entryContext: inputDir,
      output: path.join(outputDir, `${path.basename(name, '.md')}.pdf`),
    })),
);

export default vivliostyleConfig;
```

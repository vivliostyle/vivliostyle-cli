# Single HTML

### vivliostyle.config.js

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Single HTML publication',
  author: 'spring-raining',
  language: 'en',
  size: 'letter',
  entry: 'manuscript.html',
  output: [
    'draft.pdf',
    'draft', // Exports Web Publication
  ],
});
```

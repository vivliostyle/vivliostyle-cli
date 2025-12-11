# Preflight

Set the `preflight` option to apply post-processing to the PDF for special purposes such as printing-related requirements. Currently, Vivliostyle supports post-processing converts to PDF/X-1a by setting `press-ready` that's powered by [vibranthq/press-ready](https://github.com/vibranthq/press-ready).

### vivliostyle.config.js

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Preflight',
  language: 'en',
  size: 'letter',
  entry: 'manuscript.html',
  // Docker image name for preflight
  image: 'ghcr.io/vivliostyle/cli:latest',
  output: [
    {
      path: 'draft.pdf',
    },
    {
      path: 'draft_press_ready.pdf',
      // press-ready: runs press-ready on Docker container
      // press-ready-local: runs press-ready without Docker
      preflight: 'press-ready',
      // preflight: 'press-ready-local',
      preflightOption: [
        // Options for press-ready
        // Please refer https://github.com/vibranthq/press-ready#options
        'gray-scale',
        'enforce-outline',
      ],
    },
  ],
});
```

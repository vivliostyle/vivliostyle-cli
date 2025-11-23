// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Vivliostyle with Eleventy',
  author: 'John Doe',
  entry: [
    '/raw/firstpost/index.html',
    '/raw/secondpost/index.html',
    '/raw/thirdpost/index.html',
    '/raw/fourthpost/index.html',
  ],
  output: 'draft.pdf',
  theme: '@vivliostyle/theme-techbook',
  static: {
    '/': '_site',
  },
});

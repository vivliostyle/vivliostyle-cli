// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Title',
  author: 'John Doe',
  language: 'en',
  size: 'A4',
  entry: [
    '/raw/markdown-style-guide/index.html',
    '/raw/using-mdx/index.html',
    '/raw/first-post/index.html',
    '/raw/second-post/index.html',
    '/raw/third-post/index.html',
  ],
  output: [{ path: 'draft.pdf', format: 'pdf' }],
  theme: '@vivliostyle/theme-base',
  static: {
    '/': 'dist',
  },
});

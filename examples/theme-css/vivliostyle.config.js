// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Draft with the CSS theme',
  author: 'spring-raining',
  theme: 'style.css',
  entry: 'index.md',
  output: 'draft.pdf',
});

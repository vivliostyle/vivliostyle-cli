import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'TypeScript Config Example',
  author: 'Vivliostyle',
  language: 'en',
  size: 'A4',
  entry: 'manuscript.md',
  output: ['output.pdf'],
});

// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'ToC customization example',
  language: 'en',
  entry: [
    {
      rel: 'cover',
      path: 'cover-template.html',
      output: 'cover.html',
    },
    {
      rel: 'contents',
      path: 'toc-template.html',
      output: 'toc.html',
    },
    './manuscript/01_Computing Paradigms.md',
    './manuscript/02_Algorithm Design and Analysis.md',
    './manuscript/03_Systems and Architecture.md',
  ],
  output: 'draft.pdf',
  toc: {
    sectionDepth: 2,
    title: 'My awesome contents',
  },
  cover: {
    src: 'cover-image.jpg',
    name: 'My awesome cover',
  },
});

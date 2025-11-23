// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Example of Table of Contents',
  author: 'spring-raining',
  language: 'en',
  size: 'A4',
  entry: [
    './manuscript/01_Computing Paradigms.md',
    './manuscript/02_Algorithm Design and Analysis.md',
    './manuscript/03_Systems and Architecture.md',
  ],
  output: 'draft.pdf',
  toc: {
    title: 'Table of Contents',
    htmlPath: 'index.html',
    sectionDepth: 4,
  },
});

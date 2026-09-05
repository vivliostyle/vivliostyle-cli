// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Draft styled with Tailwind CSS',
  author: 'spring-raining',
  theme: 'style.css',
  entry: 'manuscript.md',
  output: 'draft.pdf',
});

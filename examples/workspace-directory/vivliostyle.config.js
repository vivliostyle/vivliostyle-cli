// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'Manual workspace directory',
  author: 'spring-raining',
  language: 'en',
  size: 'letter',
  entry: 'manuscript.md',
  output: 'draft.pdf',
  workspaceDir: 'workDir',
});

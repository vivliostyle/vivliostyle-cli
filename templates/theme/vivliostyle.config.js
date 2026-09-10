// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{themeName}} Example",
  author: {{json author}},
  language: "en",
  size: "A5",
  theme: ".",
  image: "ghcr.io/vivliostyle/cli:{{cliVersion}}",
  entry: [
    { rel: "contents" },
    "example/01_typography.md",
    "example/02_figures-and-tables.md",
    "example/03_code-and-math.md",
  ],
  toc: {
    sectionDepth: 2,
  },
  workspaceDir: ".vivliostyle",
  output: [
    "dist/example.pdf",
    {
      path: "dist/example",
      format: "webpub",
    },
  ],
});

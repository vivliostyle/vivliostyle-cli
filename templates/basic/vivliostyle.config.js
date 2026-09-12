// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: {{json (proper title)}},
  author: {{json author}},
  {{#if language}}
  language: {{json language}},
  {{/if}}
  {{#if size}}
  size: {{json size}},
  {{/if}}
  {{#if browser}}
  browser: "{{browser.type}}{{#if browser.tag}}@{{browser.tag}}{{/if}}",
  {{/if}}
  image: "ghcr.io/vivliostyle/cli:{{cliVersion}}",
  theme: ["styles/main.css", "styles/custom.css"],
  entry: [
    {
      rel: "cover",
      path: "drafts/01_cover.md",
      output: "cover.html",
      theme: ["styles/cover.css", "styles/custom.css"],
    },
    { rel: "contents" },
    "drafts/02_introduction.md",
    "drafts/03_vfm-guide.md",
    "drafts/04_features.md",
    "drafts/05_examples.md",
    "drafts/06_styling-guide.md",
    "drafts/07_advanced-features.md",
    "drafts/08_page-design.md",
    "drafts/09_distribution.md",
  ],
  toc: {
    sectionDepth: 1,
  },
  cover: {
    src: 'assets/cover-image.webp',
  },
});

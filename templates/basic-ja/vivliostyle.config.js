// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  {{#if language}}
  language: "{{language}}",
  {{/if}}
  {{#if size}}
  size: "{{size}}",
  {{/if}}
  theme: [
    {{#if theme}}
    {{json theme}},
    {{/if}}
    "./custom.css",
  ],
  {{#if browser}}
  browser: "{{browser.type}}{{#if browser.tag}}@{{browser.tag}}{{/if}}",
  {{/if}}
  image: "ghcr.io/vivliostyle/cli:{{cliVersion}}",
  entryContext: "draft",
  entry: [
    {
      rel: "cover",
      path: "01_cover.md",
      output: "cover.html",
      theme: "./cover.css",
    },
    { rel: "contents" },
    "02_introduction.md",
    "03_vfm-guide.md",
    "04_features.md",
    "05_examples.md",
    "06_styling-guide.md",
    "07_advanced-features.md",
    "08_page-design.md",
    "09_distribution.md",
  ],
  toc: {
    sectionDepth: 1,
  },
  cover: {
    src: 'cover-image.webp',
  },
});

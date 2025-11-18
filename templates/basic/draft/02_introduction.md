# Introduction

## About Vivliostyle CLI

Vivliostyle CLI is a powerful command-line tool for typesetting HTML and Markdown documents into high-quality publications. It combines the simplicity of Markdown with the professional output quality needed for books, technical documentation, academic papers, and more.

### Key Features

Vivliostyle CLI offers several advantages for digital publishing:

- **Markdown-based authoring**: Write your content in simple, readable Markdown format
- **Professional typesetting**: Generate publication-quality PDFs with sophisticated layout capabilities
- **Multiple output formats**: Support for PDF, EPUB, and Web publications
- **Theme system**: Apply pre-built themes or create custom styles with CSS
- **Multiple input formats**: Process Markdown, HTML, EPUB, and web publications

### Getting Started

Creating a new publication project is simple. Run one of the following commands:

```sh
npm create book
```

The interactive setup wizard will guide you through:

1. Choosing a template (Minimal, Basic or community templates)
2. Selecting a theme for your publication
3. Configuring basic metadata (title, author, language)

### Basic Commands

Once your project is set up, you can use these essential commands:

**Preview your document:**

```sh
vivliostyle preview manuscript.md
```

**Build a PDF:**

```sh
vivliostyle build manuscript.md -o output.pdf
```

**Specify page size:**

```sh
vivliostyle build manuscript.md -s A4 -o output.pdf
```

### Configuration File

For publications with multiple chapters or sections, use a configuration file (`vivliostyle.config.js`):

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'My Book Title',
  author: 'Author Name',
  language: 'en',
  size: 'A4',
  theme: '@vivliostyle/theme-techbook',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  output: 'book.pdf',
});
```

This configuration allows you to:

- Combine multiple source files into a single publication
- Apply consistent styling across all chapters
- Set publication metadata
- Configure output options

For more information, visit the [Vivliostyle CLI documentation](https://github.com/vivliostyle/vivliostyle-cli#readme).

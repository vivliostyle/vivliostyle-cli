# Advanced Features and Techniques

## Working with Complex Documents

This chapter explores advanced features for creating sophisticated publications with Vivliostyle CLI.

## Multi-File Publications

### Organizing Large Projects

For books and long documents, organize your content across multiple files:

```
my-book/
├── vivliostyle.config.js
├── custom.css
├── chapters/
│   ├── 01-introduction.md
│   ├── 02-getting-started.md
│   ├── 03-advanced-topics.md
│   └── 04-conclusion.md
├── front-matter/
│   ├── cover.md
│   ├── preface.md
│   └── acknowledgments.md
└── back-matter/
    ├── appendix.md
    ├── glossary.md
    └── references.md
```

### Configuration File Setup

Configure your multi-file project in `vivliostyle.config.js`:

```js
export default {
  title: 'My Complete Book',
  author: 'Author Name',
  language: 'en',
  size: 'A5',
  theme: '@vivliostyle/theme-techbook',

  entry: [
    // Front matter
    { path: 'front-matter/cover.md', theme: 'cover.css' },
    'front-matter/preface.md',
    'front-matter/acknowledgments.md',

    // Main content
    { rel: 'contents' }, // Auto-generated TOC
    'chapters/01-introduction.md',
    'chapters/02-getting-started.md',
    'chapters/03-advanced-topics.md',
    'chapters/04-conclusion.md',

    // Back matter
    'back-matter/appendix.md',
    'back-matter/glossary.md',
    'back-matter/references.md',
  ],

  toc: {
    title: 'Table of Contents',
  },

  output: [
    'book.pdf',
    {
      path: './webpub',
      format: 'webpub',
    },
  ],
};
```

## Advanced Table of Contents

### Customizing TOC Depth

Control which heading levels appear in the table of contents:

```js
export default {
  toc: {
    title: 'Contents',
    htmlPath: 'toc.html',
    sectionDepth: 2, // Include h1 and h2 only
  },
};
```

### TOC Styling

Customize the appearance in `custom.css`:

```css
/* Style the TOC container */
nav[role='doc-toc'] {
  font-size: 0.95em;
  line-height: 1.8;
}

/* Style TOC entries by level */
nav[role='doc-toc'] ul {
  list-style: none;
  padding-left: 0;
}

nav[role='doc-toc'] ul ul {
  padding-left: 1.5em;
}

/* Add dots between title and page number */
nav[role='doc-toc'] a::after {
  content: leader('.') target-counter(attr(href), page);
  float: right;
}
```

## Cover Page Customization

### Auto-Generated Covers

Create a cover from your metadata:

```js
export default {
  title: 'Professional Publication',
  author: 'Jane Smith',

  cover: {
    htmlPath: 'cover.html',
  },
};
```

### Custom Cover Design

For full control, create a custom cover with frontmatter:

```md
---
class: cover-page
---

<div class="cover-container">

# My Book Title

## A Comprehensive Guide

### by Author Name

**2024 Edition**

</div>
```

Style it in `custom.css`:

```css
.cover-page {
  text-align: center;
  padding-top: 30%;
  page-break-after: always;
}

.cover-page h1 {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 2rem;
  color: #2c3e50;
}

.cover-page h2 {
  font-size: 2rem;
  font-weight: 300;
  margin-bottom: 3rem;
  color: #7f8c8d;
}

.cover-page h3 {
  font-size: 1.5rem;
  font-style: italic;
  margin-bottom: 1rem;
}
```

## Cross-References and Citations

### Figure References

Reference figures automatically:

```md
See Figure [](#chart-sales) for details.

![Sales Growth Chart](./images/sales-chart.png){#chart-sales}

<figcaption>Figure: Annual sales growth 2020-2024</figcaption>
```

### Table References

Similarly, reference tables:

```md
The data in Table [](#results-summary) shows...

<div id="results-summary">

| Year | Revenue | Growth |
| ---- | ------- | ------ |
| 2022 | $1.2M   | 15%    |
| 2023 | $1.5M   | 25%    |
| 2024 | $2.1M   | 40%    |

</div>
```

### Section Cross-References

Reference other sections:

```md
For more information, see Section [](#advanced-techniques).

## Advanced Techniques {#advanced-techniques}
```

## Working with Images

### Responsive Images

Images adapt to available space:

```md
![Landscape Photo](./images/landscape.jpg)
```

### Controlling Image Size

Use inline styles or classes:

```md
![Small Logo](./logo.png){width="100px"}

![Half-Width Image](./diagram.png){style="width: 50%;"}
```

### Figure with Caption

```md
![Complex System Architecture](./architecture.png)

<figcaption>
Figure 1: The microservices architecture showing communication
between services and data flow patterns.
</figcaption>
```

## Advanced Typography

### Drop Caps

Create decorative first letters:

```css
.chapter-start::first-letter {
  float: left;
  font-size: 3.5em;
  line-height: 0.9;
  margin-right: 0.1em;
  font-weight: bold;
}
```

Usage:

```md
<p class="chapter-start">
The story begins on a dark and stormy night...
</p>
```

### Small Caps

Use small caps for emphasis:

```css
.smallcaps {
  font-variant: small-caps;
  letter-spacing: 0.05em;
}
```

Example: <span class="smallcaps">Chapter One</span>

### Custom Font Loading

Load web fonts in your CSS:

```css
@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap');

:root {
  --vs-font-family: 'Merriweather', Georgia, serif;
}
```

## Code Documentation Features

### Multi-Language Code Blocks

### Syntax Highlighting Themes

Change the syntax highlighting theme in `custom.css`:

```css
/* Use Okaidia theme for code blocks */
@import url('./node_modules/@vivliostyle/theme-base/css/prism/theme-okaidia.css');
```

### Line Highlighting

Highlight important lines:

```js{4-6}:important-function.js
function processData(input) {
  const validated = validate(input);

  // This is the critical section
  const result = transform(validated);
  return optimize(result);

  return result;
}
```

## Mathematical Typesetting

### Complex Equations

Display complex mathematical expressions:

**Matrix Operations:**

$$
\begin{bmatrix}
a_{11} & a_{12} & a_{13} \\
a_{21} & a_{22} & a_{23} \\
a_{31} & a_{32} & a_{33}
\end{bmatrix}
\times
\begin{bmatrix}
x \\
y \\
z
\end{bmatrix}
=
\begin{bmatrix}
b_1 \\
b_2 \\
b_3
\end{bmatrix}
$$

**Calculus:**

$$
\frac{d}{dx}\int_{a}^{x} f(t)\,dt = f(x)
$$

**Statistics:**

The probability density function of a normal distribution:

$$
f(x \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

### Aligned Equations

Show step-by-step derivations:

$$
\begin{aligned}
(a + b)^2 &= (a + b)(a + b) \\
&= a^2 + ab + ba + b^2 \\
&= a^2 + 2ab + b^2
\end{aligned}
$$

## Internationalization

### Multiple Languages

Support for various writing systems:

**Japanese (Horizontal):**

Vivliostyle CLIは、{日本語|にほんご}を含む{多言語|たげんご}に{対応|たいおう}しています。

**Japanese (Vertical):**

Configure vertical writing:

```js
export default {
  language: 'ja',
  theme: '@vivliostyle/theme-bunko',
};
```

**Right-to-Left Languages:**

Set direction for Arabic, Hebrew, etc.:

```css
:root {
  direction: rtl;
}
```

### Language-Specific Styling

Apply styles based on language:

```css
:lang(ja) {
  --vs-font-family: 'Noto Serif JP', 'Yu Mincho', serif;
  line-height: 1.9;
}

:lang(en) {
  --vs-font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
}
```

## Print Production Features

### Crop Marks and Bleed

Add crop marks for professional printing:

```bash
vivliostyle build book.md -m --bleed 3mm --crop-offset 10mm
```

Or configure in css:

```css
@page {
  marks: crop cross;
  bleed: 3mm;
  crop-offset: 10mm;
}
```

## Performance Optimization

### Quick Preview Mode

For large documents, use quick mode:

```bash
vivliostyle preview large-book.md --quick
```

This mode speeds up rendering by approximating page counts.

## Next Steps

These advanced features enable you to create professional publications that rival traditionally typeset books. Experiment with different combinations to find the workflow that best suits your needs.

For more examples and community contributions, visit:

- [Vivliostyle Samples](https://vivliostyle.github.io/vivliostyle_doc/samples/)
- [Awesome Vivliostyle](https://github.com/vivliostyle/awesome-vivliostyle)

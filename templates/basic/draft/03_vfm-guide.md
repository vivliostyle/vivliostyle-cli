# VFM: Vivliostyle Flavored Markdown

## What is VFM?

VFM (Vivliostyle Flavored Markdown) is a Markdown variant optimized for professional publishing. It extends standard Markdown with features specifically designed for creating high-quality documents and publications.

VFM is based on CommonMark and GitHub Flavored Markdown, with additional enhancements for typography, mathematical expressions, and semantic document structure.

## Core Markdown Syntax

VFM supports all standard Markdown features:

### Headings

```md
# Heading 1

## Heading 2

### Heading 3
```

### Text Formatting

Emphasize text with _italic_ or **bold** formatting. You can also combine them for **_bold italic_** text.

### Lists

Unordered lists:

- First item
- Second item
  - Nested item
  - Another nested item
- Third item

Ordered lists:

1. First step
2. Second step
3. Third step

### Links and Images

Create [links to websites](https://vivliostyle.org) or reference other documents.

Images can be embedded with captions:

![Sample diagram caption](https://via.placeholder.com/400x200)

### Blockquotes

> This is a blockquote. It can span multiple lines and is useful for highlighting important information or quoting external sources.
>
> Blockquotes can contain multiple paragraphs.

### Code

Inline code looks like `const x = 42;`.

Code blocks with syntax highlighting:

```js
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet('World'));
```

## VFM Extended Features

### Code Blocks with Captions

VFM allows you to add captions to code blocks:

```js:example.js
// This code block has a caption
function calculateSum(a, b) {
  return a + b;
}
```

You can also use the alternative syntax:

```python title=data_analysis.py
import pandas as pd

df = pd.read_csv('data.csv')
print(df.head())
```

### Mathematical Expressions

VFM supports mathematical notation using LaTeX syntax.

Inline math: The formula $E = mc^2$ represents mass-energy equivalence.

Display math for larger equations:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

More complex example:

$$
f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n
$$

### Footnotes

VFM supports several footnote styles.

Reference-style footnotes[^1] are created with a reference marker and a separate definition.

You can also use named footnotes[^note-name] for better readability in the source.

Inline footnotes^[This is an inline footnote that appears directly in the text.] are convenient for shorter annotations.

[^1]: This is the content of the first footnote.

[^note-name]: Named footnotes make your Markdown source more maintainable.

### Ruby Annotations

Ruby text is useful for showing pronunciation or providing glosses, especially for East Asian languages:

This is how you write ruby: {漢字|かんじ} means "Chinese characters" in Japanese.

You can also use it for other purposes: {HTML|Hypertext Markup Language}.

### Frontmatter

VFM files can include YAML frontmatter to specify metadata:

```yaml
---
title: 'Document Title'
author: 'Author Name'
lang: 'en'
---
```

### Hard Line Breaks

When enabled in configuration, VFM can convert single line breaks into `<br>` elements,
preserving the visual structure
of your source text
in the output.

### Raw HTML

VFM allows you to include raw HTML when needed:

<div class="custom-container">

You can mix **Markdown** formatting inside HTML blocks if you include blank lines.

</div>

### Sectionization

VFM automatically wraps content following headings in semantic `<section>` elements. This creates a proper document outline and enables advanced styling based on document structure.

To prevent automatic section creation, end your heading with matching hash marks:

```md
# Heading without section
```

## Additional Resources

For the complete VFM specification and advanced features, visit:

- [VFM Documentation](https://vivliostyle.github.io/vfm/#/vfm)
- [Vivliostyle User Guide](https://docs.vivliostyle.org/)
- [Vivliostyle Themes](https://github.com/vivliostyle/themes)

# Page Design and Layout

## Understanding Paged Media

Unlike web pages that scroll infinitely, printed publications divide content into discrete pages. Vivliostyle excels at creating beautiful paged layouts suitable for PDF output and professional printing.

## Page Size and Orientation

### Standard Page Sizes

Choose from standard paper sizes:

```bash
# Common sizes
vivliostyle build document.md -s A4      # 210mm × 297mm
vivliostyle build document.md -s A5      # 148mm × 210mm
vivliostyle build document.md -s letter  # 8.5in × 11in
vivliostyle build document.md -s B5      # 176mm × 250mm
```

Or configure in `vivliostyle.config.js`:

```js
export default {
  size: 'A5',
  entry: ['book.md'],
};
```

### Custom Dimensions

Specify exact dimensions:

```bash
vivliostyle build slide.md -s 16cm,9cm
```

For widescreen presentations:

```bash
vivliostyle build presentation.md -s 10in,7.5in
```

### Landscape Orientation

Create landscape documents:

```css
@page {
  size: A4 landscape;
}
```

Or mix orientations:

```css
/* Portrait by default */
@page {
  size: A4 portrait;
}

/* Landscape for specific pages */
@page landscape-page {
  size: A4 landscape;
}

.wide-chart {
  page: landscape-page;
}
```

## Page Margins

### Basic Margins

Set uniform margins:

```css
@page {
  margin: 25mm;
}
```

Or specify each side:

```css
@page {
  margin-top: 20mm;
  margin-bottom: 20mm;
  margin-left: 25mm;
  margin-right: 25mm;
}
```

Using CSS variables:

```css
:root {
  --vs-page--margin-top: 20mm;
  --vs-page--margin-bottom: 20mm;
  --vs-page--margin-left: 25mm;
  --vs-page--margin-right: 25mm;
}
```

### Asymmetric Margins for Binding

Books often use different margins for left and right pages to accommodate binding:

```css
@page :left {
  margin-left: 30mm; /* Outer margin */
  margin-right: 20mm; /* Inner margin (binding) */
}

@page :right {
  margin-left: 20mm; /* Inner margin (binding) */
  margin-right: 30mm; /* Outer margin */
}
```

This creates a wider margin on the outside edge for easier reading.

## Headers and Footers

### Page Numbers

Add page numbers to your document:

```css
@page {
  @bottom-center {
    content: counter(page);
  }
}
```

With decorative formatting:

```css
@page {
  @bottom-center {
    content: '— ' counter(page) ' —';
    font-size: 10pt;
    color: #666;
  }
}
```

### Running Headers

Display the document title in headers:

```css
@page {
  @top-left {
    content: env(doc-title);
    font-size: 9pt;
    font-style: italic;
  }

  @top-right {
    content: env(pub-title);
    font-size: 9pt;
  }
}
```

Using CSS variables in `custom.css`:

```css
:root {
  --vs-page--mbox-content-top-left: env(doc-title);
  --vs-page--mbox-content-top-right: env(pub-title);
  --vs-page--mbox-content-bottom-center: counter(page);
}
```

### Different Headers for Left/Right Pages

Create traditional book layouts:

```css
@page :left {
  @top-left {
    content: counter(page);
  }
  @top-right {
    content: env(doc-title);
  }
}

@page :right {
  @top-left {
    content: env(pub-title);
  }
  @top-right {
    content: counter(page);
  }
}
```

### Removing Headers on First Page

Clean first pages without headers:

```css
@page :first {
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
  @bottom-center {
    content: none;
  }
}
```

## Page Numbering Schemes

### Roman Numerals for Front Matter

Use different numbering styles:

```css
/* Front matter with lowercase Roman numerals */
@page front-matter {
  @bottom-center {
    content: counter(page, lower-roman);
  }
}

/* Main content with Arabic numerals */
@page main-content {
  @bottom-center {
    content: counter(page);
  }
}
```

Apply to content:

```md
<div style="page: front-matter;">

# Preface

Front matter content...

</div>

<div style="page: main-content; counter-reset: page 1;">

# Chapter 1

Main content starts here...

</div>
```

Or you can add the page style with frontmatter:

```md
---
class: front-matter
---

# Preface

Front matter content...
```

### Starting Page Numbers

Reset page numbering:

```css
.new-chapter {
  counter-reset: page 1;
}
```

Or continue from a specific number:

```css
.volume-two {
  counter-set: page 201;
}
```

## Page Break Control

### Forcing Page Breaks

Start new pages at specific points:

```css
.chapter {
  break-before: page;
}
```

Or use utility classes:

```css
.page-break {
  break-after: page;
}
```

In Markdown:

```md
# Chapter 1

Content...

<div class="page-break"></div>

# Chapter 2

New chapter on new page...
```

### Avoiding Breaks

Keep content together:

```css
/* Don't break headings from following content */
h1,
h2,
h3,
h4,
h5,
h6 {
  break-after: avoid;
}

/* Keep tables together */
table {
  break-inside: avoid;
}

/* Keep figures together */
figure {
  break-inside: avoid;
}

/* Keep code blocks together */
pre {
  break-inside: avoid;
}
```

### Orphans and Widows

Prevent lonely lines:

```css
p {
  orphans: 3; /* Minimum 3 lines at bottom of page */
  widows: 3; /* Minimum 3 lines at top of page */
}
```

## Multi-Column Layouts

### Two-Column Text

Create newspaper-style columns:

```css
.two-column {
  column-count: 2;
  column-gap: 2em;
  column-rule: 1px solid #ddd;
}
```

Usage:

```md
<div class="two-column">

# Introduction

This text flows across two columns, creating a magazine-style layout. Content automatically balances between columns.

The column-rule adds a visual separator between columns.

</div>
```

### Column Breaks

Control column breaks:

```css
.column-break-before {
  break-before: column;
}

.avoid-column-break {
  break-inside: avoid;
}
```

### Spanning Columns

Make elements span all columns:

```css
.two-column h2 {
  column-span: all;
  margin-top: 1em;
  margin-bottom: 0.5em;
}
```

## Named Pages

### Creating Page Templates

Define different page styles:

```css
@page chapter-opening {
  margin-top: 50mm;
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
}

@page standard {
  margin-top: 20mm;
  @top-left {
    content: env(doc-title);
  }
  @top-right {
    content: counter(page);
  }
}

@page appendix {
  @bottom-center {
    content: 'Appendix ' counter(page, upper-alpha);
  }
}
```

### Applying Named Pages

```md
<div style="page: chapter-opening;">

# Chapter 1: The Beginning

</div>

<div style="page: standard;">

Regular chapter content...

</div>
```

## Spread Design

### Facing Pages

Design for two-page spreads:

```css
@page :left {
  margin-left: 30mm;
  margin-right: 15mm;
  background: linear-gradient(to left, #fff 95%, #f8f8f8 100%);
}

@page :right {
  margin-left: 15mm;
  margin-right: 30mm;
  background: linear-gradient(to right, #fff 95%, #f8f8f8 100%);
}
```

### Blank Pages

Insert blank pages for chapter openings:

```css
.chapter {
  break-before: right; /* Always start on right page */
}
```

This automatically inserts a blank left page if needed.

## Page Backgrounds

### Adding Background Images

```css
@page {
  background-image: url('./images/watermark.png');
  background-position: center;
  background-size: 80%;
  background-repeat: no-repeat;
  opacity: 0.1;
}
```

### Decorative Borders

```css
@page {
  border: 2pt double #333;
  padding: 10mm;
}
```

### Page-Specific Backgrounds

```css
@page cover {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin: 0;
}

@page :first {
  background-color: #f9f9f9;
}
```

## Responsive Page Design

### Screen vs. Print Styles

Optimize for different outputs:

```css
/* Print styles */
@media print {
  @page {
    size: A5;
    margin: 20mm;
  }

  body {
    font-size: 10pt;
  }
}

/* Screen styles */
@media screen {
  body {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-size: 16px;
  }
}
```

## Best Practices

### 1. Test Early and Often

Preview your page design frequently during development. Page breaks can affect layout in unexpected ways.

### 2. Consider the Medium

Design differently for screen PDFs vs. print-ready files. Screen PDFs can use color freely; print may require grayscale or specific color profiles.

### 3. Plan for Binding

Account for the binding method (perfect bound, saddle stitch, spiral) when setting margins.

### 4. Use Consistent Spacing

Maintain consistent margins and spacing throughout your document for a professional appearance.

### 5. Respect Printing Standards

When preparing for commercial printing, follow industry-standard bleed (3mm) and safe zones.

## Conclusion

Thoughtful page design transforms your content into a professional publication. Experiment with these techniques to create layouts that enhance readability and visual appeal.

Remember: good design is invisible. Readers should focus on your content, not the formatting.

# Styling and Customization Guide

## Introduction to Custom Styling

This chapter demonstrates how to customize the appearance of your Vivliostyle publication using CSS custom properties and custom classes. The examples in this document work with the `custom.css` file included in this template.

## Using CSS Custom Properties

CSS custom properties (also known as CSS variables) provide a powerful way to customize your document's appearance without directly modifying theme files.

### Basic Typography Customization

To change the font family for your entire document, uncomment and modify the `--vs-font-family` variable in `custom.css`:

```css
:root {
  --vs-font-family: 'Georgia', 'Times New Roman', serif;
}
```

This single line changes the typeface throughout your publication.

### Adjusting Font Sizes

Control heading sizes independently:

```css
:root {
  --vs--h1-font-size: 3rem;
  --vs--h2-font-size: 2.25rem;
  --vs--h3-font-size: 1.75rem;
}
```

Or apply consistent styling to all headings at once:

```css
:root {
  --vs--heading-font-family: 'Helvetica Neue', sans-serif;
  --vs--heading-font-weight: 700;
  --vs--heading-line-height: 1.3;
}
```

## Custom Classes for Special Elements

### Note Boxes

<div class="note">

**Note:** This is an informational note box. It draws attention to important supplementary information without interrupting the main flow of text.

To enable this styling, uncomment the `.note` class definition in `custom.css`.

</div>

The Markdown source for this note box:

```md
<div class="note">

**Note:** Your content here...

</div>
```

### Warning Boxes

<div class="warning">

**Warning:** This is a warning box for critical information that requires special attention. Use it sparingly to highlight potential issues or important caveats.

</div>

## Page Layout Customization

### Headers and Footers

Configure headers and footers using CSS custom properties for professional-looking documents:

```css
:root {
  /* Display page numbers in bottom center */
  --vs-page--mbox-content-bottom-center: counter(page);

  /* Display document title in top left */
  --vs-page--mbox-content-top-left: env(doc-title);

  /* Display chapter title in top right */
  --vs-page--mbox-content-top-right: env(pub-title);
}
```

### Custom Page Breaks

Control page breaks for better layout:

<div class="break-after-page"></div>

Use the `.break-after-page` class to force a page break, or `.break-inside-avoid` to prevent breaking within an element.

## Color Schemes

### Customizing Colors

Define a consistent color scheme:

```css
:root {
  --vs-color-bg: #ffffff;
  --vs-color-body: #2c3e50;
  --vs--anchor-color: #3498db;
}
```

### Syntax Highlighting

Customize code block appearance:

```css
:root {
  --vs-prism--background: #f8f8f8;
  --vs-prism--color: #2c3e50;
  --vs-prism--color-comment: #6a737d;
}
```

Example with custom styling:

```python:data_processing.py
import pandas as pd
import numpy as np

def process_data(df):
    """Process DataFrame and return summary statistics."""
    return df.describe()

# Load and process data
data = pd.read_csv('input.csv')
summary = process_data(data)
print(summary)
```

## Tables and Lists

### Enhanced Table Styling

Customize table appearance:

```css
:root {
  --vs--table-border-width-column: 2px;
  --vs--table-border-color: #34495e;
  --vs--table-cell-padding-block: 1em;
}
```

Example table with custom styling:

| Feature     | Basic Theme  | Custom Theme   |
| ----------- | ------------ | -------------- |
| Typography  | System fonts | Custom fonts   |
| Colors      | Default      | Branded colors |
| Spacing     | Standard     | Optimized      |
| Page Layout | Single-sided | Two-sided      |

### List Customization

Control list styling:

```css
:root {
  --vs--ul-list-style-type: square;
  --vs--ol-list-style-type: lower-roman;
  --vs--li-margin-block: 0.75em;
}
```

## Mathematical Expressions

Mathematics render beautifully with proper spacing:

The quadratic formula solves equations of the form $ax^2 + bx + c = 0$:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

For inline math, the Pythagorean theorem states that $a^2 + b^2 = c^2$ for right triangles.

## Footnotes and References

Footnotes provide additional context without cluttering the main text<span class="footnote">This is a reference-style footnote demonstrating the default styling.</span> The styling can be customized:

```css
:root {
  --vs-footnote--call-font-size: 0.75em;
  --vs-footnote--call-content: '[' counter(footnote) ']';
}
```

You can also use named footnotes <span class="footnote">Named footnotes make your Markdown source more readable and maintainable.</span> for better maintainability in your source files.

## Blockquotes

> Customize blockquote styling to match your document's aesthetic:
>
> ```css
> :root {
>   --vs--blockquote-font-size: 0.95em;
>   --vs--blockquote-margin-inline: 2em 0;
> }
> ```
>
> This creates visually distinct quotations that stand out from body text.

## Two-Column Layouts

For specific sections, you can define two-column layouts:

```css
.two-column {
  column-count: 2;
  column-gap: 2em;
  column-rule: 1px solid #e0e0e0;
}
```

## Section Numbering

Enable automatic section numbering for longer documents:

```css
:root {
  --vs-section--marker-display: inline;
}
```

This automatically numbers sections and enables cross-references.

## Advanced Techniques

### Conditional Styling by Page

Style the first page differently:

```css
@page :first {
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
}
```

### Left and Right Page Layouts

Create asymmetric margins for two-sided printing:

```css
@page :left {
  --vs-page--mbox-content-bottom-left: counter(page);
}

@page :right {
  --vs-page--mbox-content-bottom-right: counter(page);
}
```

## Putting It All Together

The power of Vivliostyle's theming system comes from combining these techniques. By thoughtfully customizing CSS variables and using semantic classes, you can create professional publications that match your brand and requirements.

Start with small changes, preview frequently, and build up to more complex customizations as you become comfortable with the system.

## Additional Resources

- [Vivliostyle Themes Documentation](https://github.com/vivliostyle/themes)
- [CSS Paged Media Module](https://www.w3.org/TR/css-page-3/)
- [Vivliostyle User Guide](https://docs.vivliostyle.org/)

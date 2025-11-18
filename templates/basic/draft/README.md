# Vivliostyle Basic Template - Draft Content

This directory contains comprehensive documentation and examples for using Vivliostyle CLI. These files demonstrate best practices for creating professional publications with Markdown.

## Contents

1. **[01_cover.md](01_cover.md)** - Cover page template

   - Example of frontmatter usage
   - Simple cover page structure

2. **[02_introduction.md](02_introduction.md)** - Introduction to Vivliostyle CLI

   - Overview of key features
   - Getting started guide
   - Basic commands
   - Configuration file usage

3. **[03_vfm-guide.md](03_vfm-guide.md)** - VFM (Vivliostyle Flavored Markdown) guide

   - Standard Markdown syntax
   - VFM extended features (code captions, math, footnotes, ruby)
   - Best practices

4. **[04_features.md](04_features.md)** - Key features overview

   - Themes and styling
   - Multiple output formats
   - Configuration files
   - Preview and development

5. **[05_examples.md](05_examples.md)** - Practical examples

   - Technical documentation
   - Academic writing
   - Multilingual content
   - Creative writing
   - Complex document structures

6. **[06_styling-guide.md](06_styling-guide.md)** - Styling and customization

   - CSS custom properties
   - Custom classes
   - Page layout
   - Colors and typography

7. **[07_advanced-features.md](07_advanced-features.md)** - Advanced techniques

   - Multi-file publications
   - Advanced TOC
   - Cover page customization
   - Cross-references
   - Working with images

8. **[08_page-design.md](08_page-design.md)** - Page design and layout

   - Page sizes and orientation
   - Margins and spacing
   - Headers and footers
   - Page breaks
   - Multi-column layouts
   - Bleed and crop marks

9. **[09_workflow.md](09_workflow.md)** - Complete publishing workflow
   - Project setup
   - Content development
   - Styling and design
   - Building output
   - Quality assurance
   - Publication process

## Using These Files

### As a Complete Document

To build all these files into a single publication:

```bash
vivliostyle build *.md -o complete-guide.pdf
```

Or create a `vivliostyle.config.js`:

```js
export default {
  title: 'Vivliostyle Complete Guide',
  author: 'Your Name',
  language: 'en',
  size: 'A4',
  theme: '@vivliostyle/theme-techbook',
  entry: [
    'draft/01_cover.md',
    'draft/02_introduction.md',
    'draft/03_vfm-guide.md',
    'draft/04_features.md',
    'draft/05_examples.md',
    'draft/06_styling-guide.md',
    'draft/07_advanced-features.md',
    'draft/08_page-design.md',
    'draft/09_workflow.md',
  ],
  output: 'guide.pdf',
};
```

Then run:

```bash
vivliostyle build
```

### As Individual References

Each file is self-contained and can be used independently:

```bash
# Preview a single file
vivliostyle preview draft/03_vfm-guide.md

# Build a single file
vivliostyle build draft/06_styling-guide.md -o styling-guide.pdf
```

### As Templates for Your Own Content

1. **Copy the file** you want to use as a starting point
2. **Modify the content** to match your needs
3. **Customize the styling** in `custom.css`
4. **Build your publication**

Example:

```bash
# Copy the template
cp draft/02_introduction.md my-intro.md

# Edit the file
nano my-intro.md

# Preview
vivliostyle preview my-intro.md

# Build
vivliostyle build my-intro.md -o my-document.pdf
```

## Customization with CSS

These files work with the `custom.css` file in the parent directory. The CSS file contains:

- Typography customization
- Color schemes
- Page layout settings
- Custom classes for special elements
- Print-specific styles

Uncomment and modify the CSS variables in `custom.css` to customize the appearance.

## Features Demonstrated

These files showcase:

- ✅ VFM syntax (code blocks, math, footnotes, ruby)
- ✅ Document structure and organization
- ✅ Custom CSS classes
- ✅ Page layout techniques
- ✅ Tables and lists
- ✅ Images and figures
- ✅ Code examples with syntax highlighting
- ✅ Mathematical expressions
- ✅ Cross-references
- ✅ Multi-level headings
- ✅ Blockquotes and callouts

## Quick Start

To get started quickly:

1. **Choose a file** that matches your needs
2. **Preview it** to see how it looks:
   ```bash
   vivliostyle preview draft/02_introduction.md
   ```
3. **Customize `custom.css`** to match your style
4. **Modify the content** for your publication
5. **Build the final output**:
   ```bash
   vivliostyle build your-file.md -o output.pdf
   ```

## Learning Path

Recommended reading order:

1. Start with **02_introduction.md** to understand Vivliostyle CLI basics
2. Read **03_vfm-guide.md** to learn VFM syntax
3. Review **06_styling-guide.md** to customize appearance
4. Study **09_workflow.md** for the complete publishing process
5. Explore other files as needed for specific features

## Tips

- **Preview often**: Use `vivliostyle preview` while writing
- **Start simple**: Begin with basic features, add complexity gradually
- **Use custom.css**: Centralize your styling in one place
- **Check examples**: The files contain many practical examples
- **Test output**: Always check the final PDF for page breaks and layout

## Getting Help

If you need assistance:

- [Vivliostyle CLI Documentation](https://github.com/vivliostyle/vivliostyle-cli)
- [VFM Documentation](https://vivliostyle.github.io/vfm/)
- [Vivliostyle Themes](https://github.com/vivliostyle/themes)
- [Community Forum](https://github.com/vivliostyle/vivliostyle.js/discussions)

## Contributing

Found an error or want to improve these templates? Contributions are welcome!

## License

These template files are provided as examples for use with Vivliostyle CLI. Modify and use them freely for your publications.

---

**Happy Publishing!**

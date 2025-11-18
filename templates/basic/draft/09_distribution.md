# Output Formats and Distribution

## Introduction

Vivliostyle CLI supports multiple output formats for different distribution channels. This chapter focuses on building your publication in various formats and preparing them for distribution.

## Output Formats Overview

Vivliostyle CLI supports three main output formats:

| Format     | Extension | Use Case                              |
| ---------- | --------- | ------------------------------------- |
| **PDF**    | `.pdf`    | Print, digital distribution, archival |
| **EPUB**   | `.epub`   | E-readers, mobile devices             |
| **WebPub** | Directory | Web browsers, online reading          |

## Building Output: PDF Format

### Basic PDF Output

Generate a standard PDF:

```bash
vivliostyle build manuscript.md -o output.pdf
```

Or use your configuration file:

```bash
npm run build
```

### PDF with Page Size

Specify page size for your PDF:

```bash
vivliostyle build manuscript.md -s A5 -o book.pdf
vivliostyle build manuscript.md -s letter -o document.pdf
```

### Print-Ready PDF with Crop Marks

For commercial printing, add crop marks and bleed:

```bash
vivliostyle build manuscript.md \
  -s A5 \
  -m \
  --bleed 3mm \
  --crop-offset 10mm \
  -o print-ready.pdf
```

**Options explained:**

- `-m` or `--crop-marks`: Add crop marks
- `--bleed 3mm`: Extend content 3mm beyond trim
- `--crop-offset 10mm`: Space around crop marks

### PDF/X-1a Format for Professional Printing

For print submissions requiring PDF/X-1a format, use the preflight option:

```bash
vivliostyle build manuscript.md --preflight press-ready -o print.pdf
```

**Prerequisites**: Docker must be installed on your system.

Configuration file example:

```js
export default defineConfig({
  title: 'My Book',
  entry: ['manuscript.md'],
  output: 'book.pdf',
  preflight: 'press-ready',
});
```

#### Preflight Options

Add processing options to press-ready:

```bash
# Convert to grayscale
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option gray-scale

# Force outline fonts (embed fonts as outlines)
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option enforce-outline

# Combine multiple options
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option gray-scale \
  --preflight-option enforce-outline
```

**Note**: For local processing without Docker, use `--preflight press-ready-local`, though Docker is recommended for consistency.

### PDF Bookmarks (Table of Contents)

Vivliostyle automatically generates PDF bookmarks from your table of contents, enabling navigation in PDF readers like Adobe Acrobat.

To enable bookmarks:

1. Configure a table of contents in `vivliostyle.config.js`:

```js
export default {
  title: 'My Book',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  toc: {
    title: 'Table of Contents',
  },
  output: 'book.pdf',
};
```

2. Build your PDF:

```bash
vivliostyle build
```

The generated PDF will include bookmarks based on your TOC structure.

### Using Docker for Consistent Builds

For consistent results across different environments, use Docker render mode:

```bash
vivliostyle build manuscript.md --render-mode docker -o output.pdf
```

Configuration file example:

```js
export default {
  title: 'My Book',
  entry: ['manuscript.md'],
  output: 'book.pdf',
  image: 'ghcr.io/vivliostyle/cli:latest',
};
```

**Important considerations when using Docker:**

1. **Fonts**: Host fonts are not available in Docker. Use one of these approaches:

- Place font files in your project and reference them in CSS
- Use web fonts (Google Fonts, etc.)
- Use fonts available in the Docker container

2. **File access**: Only files in the workspace directory (where `vivliostyle.config.js` is located) are accessible. Ensure all images and resources are in this directory.

Example CSS for custom fonts:

```css
@font-face {
  font-family: 'CustomFont';
  src: url('./fonts/CustomFont.woff2') format('woff2');
}

:root {
  --vs-font-family: 'CustomFont', sans-serif;
}
```

## Building Output: EPUB Format

### Basic EPUB Output

Generate an EPUB file by specifying the `.epub` extension:

```bash
vivliostyle build manuscript.md -o output.epub
```

Or use the format option:

```bash
vivliostyle build manuscript.md -f epub -o book.epub
```

### EPUB with Table of Contents

For best EPUB compatibility, configure a table of contents:

```js
export default {
  title: 'My Book',
  author: 'Author Name',
  language: 'en',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  toc: {
    title: 'Table of Contents',
  },
  output: 'book.epub',
};
```

Then build:

```bash
vivliostyle build
```

### EPUB for Japanese Content

For Japanese EPUBs, use the specialized theme that complies with EBPAJ EPUB 3 guidelines:

```bash
npm install @vivliostyle/theme-epub3j
```

Configuration:

```js
export default {
  title: '日本語の本',
  author: '著者名',
  language: 'ja',
  theme: '@vivliostyle/theme-epub3j',
  entry: ['chapter1.md', 'chapter2.md'],
  output: 'book.epub',
};
```

### Multiple Output Formats

Generate both PDF and EPUB in one command:

```bash
vivliostyle build -o book.pdf -o book.epub
```

Or configure multiple outputs:

```js
export default {
  title: 'My Book',
  entry: ['manuscript.md'],
  output: ['book.pdf', 'book.epub'],
};
```

### EPUB Compatibility Notes

**Important**: Vivliostyle CLI generates EPUB 3 compliant files, but CSS styles are output as-is. Different EPUB readers may render styles differently.

For broader EPUB reader compatibility:

- Test on multiple readers (Apple Books, Kindle, Kobo, Adobe Digital Editions)
- Use reader-compatible themes
- Keep CSS simple and standard-compliant
- Avoid complex layouts that may not work on all readers

## Building Output: WebPub Format

### Basic WebPub Output

Generate a Web Publication:

```bash
vivliostyle build manuscript.md -f webpub -o ./webpub
```

This creates a directory containing:

- HTML files for each entry
- `publication.json` - Publication manifest (W3C standard)
- Assets (images, CSS, etc.)

### WebPub Structure

The generated directory structure looks like this:

```
webpub/
├── publication.json
├── index.html
├── chapter1.html
└── chapter2.html
```

### Publication Manifest

The `publication.json` file describes the publication structure:

```json
{
  "@context": "https://www.w3.org/ns/pub-context",
  "name": "My Book",
  "author": "Author Name",
  "readingOrder": [
    { "url": "chapter1.html", "title": "Chapter 1" },
    { "url": "chapter2.html", "title": "Chapter 2" }
  ],
  "resources": [{ "url": "styles/style.css" }, { "url": "images/figure1.png" }]
}
```

This follows the W3C [Publication Manifest](https://www.w3.org/TR/pub-manifest/) specification.

### Using WebPub

**As a web publication:**

1. Deploy to a web server:

   ```bash
   # Copy to web server
   rsync -av webpub/ user@server:/var/www/book/
   ```

2. Or serve locally for testing:
   ```bash
   cd webpub
   python -m http.server 8000
   # Open http://localhost:8000
   ```

**Convert WebPub to PDF:**

Generate PDF from a WebPub:

```bash
vivliostyle build webpub/publication.json -o book.pdf
```

This is useful for:

- Maintaining a single source (WebPub) for both web and print
- Preview online before generating final PDF
- Creating multiple PDF versions from one WebPub

### WebPub Configuration

Configuration file example:

```js
export default {
  title: 'My Book',
  author: 'Author Name',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  output: [
    './webpub', // WebPub directory
    'book.pdf', // PDF from same source
  ],
};
```

## Distribution Strategies

### PDF Distribution

For digital distribution, PDFs work well for:

- Downloads from your website
- Email distribution
- Academic repositories
- Document archives

### EPUB Distribution

EPUB files are ideal for:

- E-readers (Kindle, Kobo, Nook)
- Mobile devices
- Reading apps (Apple Books, Google Play Books)

**Validation before distribution:**

```bash
# Install epubcheck
npm install -g epubcheck

# Validate your EPUB
epubcheck book.epub
```

**Distribution platforms:**

- Amazon Kindle Direct Publishing (KDP) - requires conversion to MOBI/KF8
- Apple Books - accepts EPUB directly
- Google Play Books - accepts EPUB
- Kobo Writing Life - accepts EPUB
- Self-hosted download

### WebPub Distribution

Web Publications are ideal for:

- Online documentation
- Interactive publications
- Living documents that update frequently
- Content that needs web search indexing

**Deployment options:**

**1. Static hosting (Netlify, Vercel, GitHub Pages):**

```bash
# Build WebPub
vivliostyle build manuscript.md -f webpub -o ./dist

# Deploy to GitHub Pages
cd dist
git init
git add .
git commit -m "Initial publication"
git branch -M gh-pages
git remote add origin https://github.com/username/repo.git
git push -u origin gh-pages
```

**2. Traditional web server:**

```bash
# Copy to web server via SSH
rsync -av webpub/ user@server:/var/www/html/book/

# Or use FTP/SFTP client
```

**3. CDN deployment:**

Use services like Cloudflare Pages, AWS S3 + CloudFront, or Azure Static Web Apps.

Once deployed, share the URL for readers to access your WebPub. Of course, you can use Vivliostyle Viewer to read WebPubs locally or online.

```bash
vivliostyle preview webpub/publication.json
vivliostyle preview https://example.com/book/publication.json
```

## Conclusion

Vivliostyle CLI's flexible output options enable you to reach audiences across multiple platforms:

- **PDF** for print and digital distribution
- **EPUB** for e-readers and mobile devices
- **WebPub** for online access

Choose the format(s) that best serve your content and audience. Many publishers offer all three, maximizing accessibility and reach.

**Key takeaways:**

- Use `--preflight press-ready` for professional printing
- Test EPUBs with epubcheck and multiple readers
- Deploy WebPubs to static hosting for easy web distribution
- Generate multiple formats from a single source
- Validate and test thoroughly before distribution

For more information:

- [Vivliostyle CLI Documentation](https://github.com/vivliostyle/vivliostyle-cli)
- [EPUB Specifications](https://www.w3.org/publishing/epub3/)
- [W3C Publication Manifest](https://www.w3.org/TR/pub-manifest/)

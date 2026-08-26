# Vivliostyle CLI with Tailwind CSS

This example styles a publication with [Tailwind CSS](https://tailwindcss.com/) utility classes.

Vivliostyle CLI loads the PostCSS config placed in the same directory as `vivliostyle.config.js` and applies its plugins to every CSS file it processes. Setting up Tailwind CSS only requires the standard [PostCSS installation](https://tailwindcss.com/docs/installation/using-postcss); no other build step is needed.

[`postcss.config.js`](postcss.config.js) of this project loads the `@tailwindcss/postcss` plugin, followed by a small plugin that works around a current limitation of Vivliostyle Core: a rule is entirely ignored when its selector list contains a selector Vivliostyle cannot parse, such as `:host` or `::file-selector-button` that Tailwind emits. The plugin removes those selectors so that the rest of each rule stays effective.

The CSS file specified as the theme imports Tailwind CSS. It can also use Tailwind directives such as `@theme` and `@apply`, along with page rules for the paged media:

#### style.css

```css
@import 'tailwindcss';

@theme {
  --color-accent: oklch(0.55 0.12 200);
}

@page {
  size: A5;
  margin: 14mm;
}
```

Tailwind scans the manuscript files for class names, so utility classes can be used directly in Markdown — through the [VFM attribute syntax](https://vivliostyle.github.io/vfm/#/vfm) for inline elements, or through raw HTML for block-level layouts:

```md
# Vivliostyle meets Tailwind CSS {.text-4xl .font-extrabold}

<div class="rounded-xl bg-accent p-4 text-white">...</div>
```

## Usage

```sh
npm run build   # Generates draft.pdf
npm run preview # Opens the preview server
```

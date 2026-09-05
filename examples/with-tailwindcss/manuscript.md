# Vivliostyle meets Tailwind CSS {.text-4xl .font-extrabold .tracking-tight .text-accent}

This document is styled with [Tailwind CSS](https://tailwindcss.com/) utility classes.
Tailwind scans this Markdown file for class names, so you can attach utilities to
inline elements with the **VFM attribute syntax**{.bg-accent/15 .px-1 .rounded} like
`**text**{.underline}`.

For block-level layouts, write raw HTML in the manuscript:

<div class="mt-8 grid grid-cols-2 gap-4">
  <div class="rounded-xl border border-gray-300 p-4">
    <h2 class="text-lg font-bold">Utilities</h2>
    <p class="mt-2 text-sm text-gray-600">
      Spacing, typography and borders work in paged media as well.
    </p>
  </div>
  <div class="rounded-xl bg-accent p-4 text-white">
    <h2 class="text-lg font-bold">Custom theme</h2>
    <p class="mt-2 text-sm">
      This color is defined with the <code>@theme</code> directive in style.css.
    </p>
  </div>
</div>

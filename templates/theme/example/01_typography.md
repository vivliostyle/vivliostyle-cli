# Typography

This document is a sample manuscript for checking how a theme styles body text. Edit `theme.css` and run `npm run example:preview` to see the result right away.

## Paragraphs

Paragraphs are the backbone of any publication, so a theme should settle the typeface, the font size, the line height, and the space or indent between paragraphs first. Inline elements such as **bold text**, _emphasized text_, `inline code`, ~~deleted text~~, and [links](https://vivliostyle.org) should sit comfortably in the surrounding text.

Long paragraphs also show how the theme handles justification, hyphenation, and the widows and orphans at the top and bottom of a page. Keep an eye on the rhythm of the lines when you change the font size or the line height, and check the result on both the first page and the following pages.

### Headings

Headings come in six levels. The first level is used for the title of each document, the second and third levels for sections, and the deeper levels only occasionally. This section is a level-three heading.

#### A level-four heading

Deeper headings often share the size of the body text and rely on weight or spacing to stand out.

## Lists

- An unordered list item
- Another item with a nested list
  - A nested item
  - Another nested item
- The last item

1. An ordered list item
2. Another item with a nested list
   1. A nested item
   2. Another nested item
3. The last item

## Quotations

> A blockquote is used for quoted text. It is usually set apart from the main text with an indent, a rule, or a different typeface.
>
> — The source of the quotation

## Ruby and CJK Text

Ruby annotations are written as {漢字|かんじ} in VFM and rendered with the `<ruby>` element. Japanese text such as 日本語の文章 also shows whether the font stack of the theme covers CJK characters.

## Footnotes

Footnotes are placed at the bottom of the page[^1]. They can also be written inline^[This footnote is written inline.]. A theme decides the style of the footnote call in the text and the footnote area at the bottom of the page[^area].

[^1]: This is a footnote.

[^area]: The footnote area is separated from the body text by a rule.

## Horizontal Rules

A horizontal rule separates parts of a document without a heading.

---

The text continues after the rule.

import type { Element, Root, RootContent } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { u } from 'unist-builder';
import { SKIP, visit } from 'unist-util-visit';

export interface CoverStyleOptions {
  /** Page break behavior */
  pageBreakBefore?: 'recto' | 'verso' | 'left' | 'right';
}

export interface CoverOptions extends CoverStyleOptions {
  /** Cover image source path */
  src: string;
  /** Cover image alt text */
  alt?: string;
}

/**
 * Generate CSS style text for cover page
 */
export function getCoverHtmlStyle({
  pageBreakBefore,
}: CoverStyleOptions): string {
  return /* css */ `
${
  pageBreakBefore
    ? `:root {
  break-before: ${pageBreakBefore};
}`
    : ''
}
body {
  margin: 0;
}
[role="doc-cover"] {
  display: block;
  width: 100vw;
  height: 100vh;
  object-fit: contain;
}
@page {
  margin: 0;
}
`;
}

/**
 * Rehype plugin to set cover image on <img role="doc-cover">
 */
export function cover(options: CoverOptions) {
  const { src, alt, pageBreakBefore } = options;
  const styleText = getCoverHtmlStyle({ pageBreakBefore });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // Update or remove style[data-vv-style]
    visit(tree, 'element', (node: Element, index, parent) => {
      if (
        node.tagName === 'style' &&
        node.properties?.dataVvStyle !== undefined
      ) {
        if (styleText.trim()) {
          node.children = [u('text', styleText)];
        } else if (parent && typeof index === 'number') {
          // Remove the style element if no meaningful style
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
      }
    });

    // Find img[role="doc-cover"] and set src/alt
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img' && node.properties?.role === 'doc-cover') {
        node.properties.src = encodeURI(src);
        if (alt !== undefined) {
          node.properties.alt = alt;
        }
      }
    });
  };
}

/**
 * Generate default cover hast tree
 */
export function generateDefaultCoverTree({
  language,
  title,
}: {
  language?: string;
  title?: string;
}): Root {
  return u('root', [
    (
      <html lang={language}>
        <head>
          <meta charset="utf-8" />
          <title>{title || ''}</title>
          <style data-vv-style></style>
        </head>
        <body>
          <section role="region" aria-label="Cover">
            <img role="doc-cover" />
          </section>
        </body>
      </html>
    ) as RootContent,
  ]);
}

/**
 * Generate default cover HTML template
 */
export function generateDefaultCoverHtml({
  language,
  title,
}: {
  language?: string;
  title?: string;
}) {
  return toHtml(generateDefaultCoverTree({ language, title }));
}

import type { Content, Element as HElement, ElementContent, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { h } from 'hastscript';
import { u } from 'unist-builder';
import { SKIP, visit } from 'unist-util-visit';
import upath from 'upath';
import type { ManuscriptEntry } from '../../config/resolve.js';
import type {
  StructuredDocument,
  StructuredDocumentSection,
} from '../../config/schema.js';
import { getStructuredSectionFromHtml } from '../html.js';

type HastElement = Content | Root;

export interface TocStyleOptions {
  /** Page break behavior */
  pageBreakBefore?: 'recto' | 'verso' | 'left' | 'right';
  /** Page counter reset value */
  pageCounterReset?: number;
}

export interface TocOptions extends TocStyleOptions {
  /** Title for the table of contents */
  tocTitle?: string;
  /** ToC content as hast elements (pre-generated) */
  tocContent?: HastElement;
  /** Manifest path for publication link (relative to distDir) */
  manifestPath?: string;
}

/**
 * Generate CSS style text for ToC page
 */
export function getTocHtmlStyle({
  pageBreakBefore,
  pageCounterReset,
}: TocStyleOptions): string | null {
  if (!pageBreakBefore && typeof pageCounterReset !== 'number') {
    return null;
  }
  return /* css */ `
${
  pageBreakBefore
    ? /* css */ `:root {
  break-before: ${pageBreakBefore};
}`
    : ''
}
${
  // Note: `--vs-document-first-page-counter-reset` is reserved variable name in Vivliostyle base themes
  typeof pageCounterReset === 'number'
    ? /* css */ `@page :nth(1) {
  --vs-document-first-page-counter-reset: page ${Math.floor(pageCounterReset - 1)};
  counter-reset: var(--vs-document-first-page-counter-reset);
}`
    : ''
}
`;
}

/**
 * Default transform functions for ToC generation
 */
export const defaultTocTransform = {
  transformDocumentList:
    (nodeList: StructuredDocument[]) =>
    (propsList: { children: HastElement | HastElement[] }[]): HastElement => {
      return h(
        'ol',
        nodeList
          .map((a, i) => [a, propsList[i]] as const)
          .flatMap(
            ([{ href, title, sections }, { children, ...otherProps }]) => {
              // don't display the document title if it has only one top-level H1 heading
              if (sections?.length === 1 && sections[0].level === 1) {
                return [children].flat().flatMap((e) => {
                  if (
                    e &&
                    'type' in e &&
                    e.type === 'element' &&
                    e.tagName === 'ol'
                  ) {
                    return e.children;
                  }
                  return e;
                }) as ElementContent[];
              }
              return h('li', otherProps, [
                h('a', { href }, [u('text', title || '')]),
                ...[children].flat().filter(Boolean),
              ] as ElementContent[]);
            },
          ) as ElementContent[],
      );
    },
  transformSectionList:
    (nodeList: StructuredDocumentSection[]) =>
    (propsList: { children: HastElement | HastElement[] }[]): HastElement => {
      return h(
        'ol',
        nodeList
          .map((a, i) => [a, propsList[i]] as const)
          .map(
            ([{ headingHtml, href, level }, { children, ...otherProps }]) => {
              // Use 'raw' type for HTML content (will be processed by rehype-raw if needed)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const headingContent: any = u('raw', headingHtml);
              return h('li', { ...otherProps, dataSectionLevel: level }, [
                href
                  ? h('a', { href }, [headingContent])
                  : h('span', [headingContent]),
                ...[children].flat().filter(Boolean),
              ] as ElementContent[]);
            },
          ) as ElementContent[],
      );
    },
};

/**
 * Rehype plugin to inject table of contents into <nav role="doc-toc">
 */
export function toc(options: TocOptions = {}) {
  const {
    tocTitle,
    tocContent,
    manifestPath,
    pageBreakBefore,
    pageCounterReset,
  } = options;
  const styleText = getTocHtmlStyle({ pageBreakBefore, pageCounterReset });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (tree: any) => {
    // Add publication manifest link if not present
    if (manifestPath) {
      let hasManifestLink = false;
      visit(tree, 'element', (node: HElement) => {
        if (
          node.tagName === 'link' &&
          node.properties?.rel === 'publication' &&
          node.properties?.type === 'application/ld+json'
        ) {
          hasManifestLink = true;
        }
      });

      if (!hasManifestLink) {
        visit(tree, 'element', (node: HElement) => {
          if (node.tagName === 'head') {
            node.children.push(
              (
                <link
                  rel="publication"
                  type="application/ld+json"
                  href={encodeURI(manifestPath)}
                />
              ) as ElementContent,
            );
          }
        });
      }
    }

    // Update or remove style[data-vv-style]
    visit(tree, 'element', (node: HElement, index, parent) => {
      if (
        node.tagName === 'style' &&
        node.properties?.dataVvStyle !== undefined
      ) {
        if (styleText) {
          node.children = [u('text', styleText)];
        } else if (parent && typeof index === 'number') {
          // Remove the style element
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
      }
    });

    // Find nav element and inject ToC content
    // Check if nav has no meaningful content (empty or whitespace-only text nodes)
    const isNavEmpty = (node: HElement): boolean => {
      return node.children.every(
        (child) => child.type === 'text' && child.value.trim() === '',
      );
    };

    visit(tree, 'element', (node: HElement) => {
      if (
        (node.tagName === 'nav' || node.properties?.role === 'doc-toc') &&
        isNavEmpty(node)
      ) {
        // Clear any whitespace-only text nodes
        node.children = [];

        // Add title heading
        if (tocTitle) {
          node.children.push((<h2>{tocTitle}</h2>) as ElementContent);
        }

        // Add ToC content
        if (tocContent) {
          if (Array.isArray(tocContent)) {
            node.children.push(...(tocContent as ElementContent[]));
          } else {
            node.children.push(tocContent as ElementContent);
          }
        }
      }
    });
  };
}

/**
 * Generate default ToC HTML template
 */
export function generateDefaultTocHtml({
  language,
  title,
}: {
  language?: string;
  title?: string;
}) {
  const html = (
    <html lang={language}>
      <head>
        <meta charset="utf-8" />
        <title>{title || ''}</title>
        <style data-vv-style></style>
      </head>
      <body>
        <h1>{title || ''}</h1>
        <nav id="toc" role="doc-toc" />
      </body>
    </html>
  );
  return toHtml(html);
}

/**
 * Generate ToC content as hast elements
 */
export async function generateTocContent({
  entries,
  distDir,
  sectionDepth,
  transform = {},
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  distDir: string;
  sectionDepth: number;
  transform?: Partial<typeof defaultTocTransform>;
}): Promise<HastElement> {
  const {
    transformDocumentList = defaultTocTransform.transformDocumentList,
    transformSectionList = defaultTocTransform.transformSectionList,
  } = transform;

  const structure = await Promise.all(
    entries.map(async (entry) => {
      const href = encodeURI(upath.relative(distDir, entry.target));
      const sections =
        sectionDepth >= 1
          ? await getStructuredSectionFromHtml(entry.target, href)
          : [];
      return {
        title: entry.title || upath.basename(entry.target, '.html'),
        href: encodeURI(upath.relative(distDir, entry.target)),
        sections,
        children: [], // TODO
      };
    }),
  );
  const docToc = transformDocumentList(structure)(
    structure.map((doc) => {
      function renderSectionList(
        sections: StructuredDocumentSection[],
      ): HastElement | HastElement[] {
        const nodeList = sections.flatMap((section) => {
          if (section.level > sectionDepth) {
            return [];
          }
          return section;
        });
        if (nodeList.length === 0) {
          return [];
        }
        return transformSectionList(nodeList)(
          nodeList.map((node) => ({
            children: [renderSectionList(node.children || [])].flat(),
          })),
        );
      }
      return {
        children: [renderSectionList(doc.sections || [])].flat(),
      };
    }),
  );

  return docToc;
}

/**
 * Generate ToC list section as HTML string
 */
export async function generateTocListSection(
  options: Parameters<typeof generateTocContent>[0],
): Promise<string> {
  const docToc = await generateTocContent(options);
  return toHtml(docToc, { allowDangerousHtml: true });
}

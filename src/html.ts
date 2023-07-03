import cheerio from 'cheerio';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import prettier from 'prettier';
import path from 'upath';
import { ManuscriptEntry } from './config.js';

export function generateTocHtml({
  entries,
  manifestPath,
  distDir,
  title,
  tocTitle,
  style,
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  manifestPath: string;
  distDir: string;
  title?: string;
  tocTitle: string;
  style?: string[];
}): string {
  const items = entries.map((entry) =>
    h(
      'li',
      h(
        'a',
        { href: encodeURI(path.relative(distDir, entry.target)) },
        entry.title || path.basename(entry.target, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h(
      'head',
      ...[
        h('title', title ?? ''),
        h('link', {
          href: encodeURI(path.relative(distDir, manifestPath)),
          rel: 'publication',
          type: 'application/ld+json',
        }),
        ...(style || []).map((s) => h('link', { href: s, rel: 'stylesheet' })),
      ].filter((n) => !!n),
    ),
    h(
      'body',
      h('h1', title || ''),
      h('nav#toc', { role: 'doc-toc' }, h('h2', tocTitle), h('ol', items)),
    ),
  );
  return prettier.format(toHTML(toc), { parser: 'html' });
}

export function processManuscriptHtml(
  filepath: string,
  {
    title,
    style,
    contentType,
    language,
  }: {
    title?: string;
    style?: string[];
    contentType?: 'text/html' | 'application/xhtml+xml';
    language?: string | null;
  },
): string {
  const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'), {
    xmlMode: contentType === 'application/xhtml+xml',
  });
  if (title) {
    if (!$('title')) {
      $('head').append($('<title></title>'));
    }
    $('title').text(title);
  }
  for (const s of style ?? []) {
    $('head').append(`<link rel="stylesheet" />`);
    $('head > *:last-child').attr('href', s);
  }
  if (language) {
    if (contentType === 'application/xhtml+xml') {
      if (!$('html').attr('xml:lang')) {
        $('html').attr('lang', language);
        $('html').attr('xml:lang', language);
      }
    } else {
      if (!$('html').attr('lang')) {
        $('html').attr('lang', language);
      }
    }
  }
  let processed = $.html();
  return processed;
}

export function isTocHtml(filepath: string): boolean {
  try {
    const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'));
    return (
      $('[role="doc-toc"], [role="directory"], nav, .toc, #toc').length > 0
    );
  } catch (err) {
    // seems not to be a html file
    return false;
  }
}

export type TocResourceTreeItem = {
  element: HTMLElement;
  label: HTMLElement;
  children?: TocResourceTreeItem[];
};
export type TocResourceTreeRoot = {
  element: HTMLElement;
  heading?: HTMLElement;
  children: TocResourceTreeItem[];
};

export function parseTocDocument(dom: JSDOM): TocResourceTreeRoot | null {
  const { document } = dom.window;

  const docTocEl = document.querySelectorAll('[role="doc-toc"]');
  if (docTocEl.length === 0) {
    return null;
  }
  const tocRoot = docTocEl.item(0);

  const parseTocItem = (element: Element): TocResourceTreeItem | null => {
    if (element.tagName !== 'LI') {
      return null;
    }
    const label = element.children.item(0);
    const ol = element.children.item(1);
    if (!label || (label.tagName !== 'A' && label.tagName !== 'SPAN')) {
      return null;
    }
    if (!ol || ol.tagName !== 'OL') {
      return { element: element as HTMLElement, label: label as HTMLElement };
    }
    const children = Array.from(ol.children).reduce<
      TocResourceTreeItem[] | null
    >((acc, val) => {
      if (!acc) {
        return acc;
      }
      const res = parseTocItem(val);
      return res && [...acc, res];
    }, []);
    return (
      children && {
        element: element as HTMLElement,
        label: label as HTMLElement,
        children,
      }
    );
  };

  let heading: HTMLElement | undefined;
  for (let child of Array.from(tocRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        TocResourceTreeItem[] | null
      >((acc, val) => {
        if (!acc) {
          return acc;
        }
        const res = parseTocItem(val);
        return res && [...acc, res];
      }, []);
      return children && { element: tocRoot as HTMLElement, heading, children };
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child as HTMLElement;
    } else {
      return null;
    }
  }
  return null;
}

export type PageListResourceTreeItem = {
  element: HTMLElement;
};
export type PageListResourceTreeRoot = {
  element: HTMLElement;
  heading?: HTMLElement;
  children: PageListResourceTreeItem[];
};

export function parsePageListDocument(
  dom: JSDOM,
): PageListResourceTreeRoot | null {
  const { document } = dom.window;

  const docPageListEl = document.querySelectorAll('[role="doc-pagelist"]');
  if (docPageListEl.length === 0) {
    return null;
  }
  const pageListRoot = docPageListEl.item(0);

  let heading: HTMLElement | undefined;
  for (let child of Array.from(pageListRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        PageListResourceTreeItem[] | null
      >((acc, element) => {
        return (
          acc &&
          (element.tagName === 'LI'
            ? [...acc, { element: element as HTMLElement }]
            : null)
        );
      }, []);
      return (
        children && { element: pageListRoot as HTMLElement, heading, children }
      );
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child as HTMLElement;
    } else {
      return null;
    }
  }
  return null;
}

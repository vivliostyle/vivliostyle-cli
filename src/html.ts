import fs from 'fs';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import { JSDOM } from 'jsdom';
import path from 'upath';
import { ParsedEntry } from './config';

export function generateTocHtml({
  entries,
  distDir,
  style,
}: {
  entries: Pick<ParsedEntry, 'target' | 'title'>[];
  distDir: string;
  style?: string;
}): string {
  const items = entries.map((entry) =>
    h(
      'li',
      h(
        'a',
        { href: path.relative(distDir, entry.target) },
        entry.title || path.basename(entry.target, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h(
      'head',
      ...[
        h('title', 'Table of Contents'),
        h('link', {
          href: 'publication.json',
          rel: 'publication',
          type: 'application/ld+json',
        }),
        style && h('link', { href: style, rel: 'stylesheet' }),
      ].filter((n) => !!n),
    ),
    h('body', h('nav#toc', { role: 'doc-toc' }, h('ul', items))),
  );
  return toHTML(toc);
}

export function processManuscriptHtml(
  filepath: string,
  {
    title,
    style,
    contentType,
  }: { title?: string; style?: string; contentType?: string },
): string {
  const sourceHtml = fs.readFileSync(filepath, 'utf8');
  const dom = new JSDOM(fs.readFileSync(filepath, 'utf8'), { contentType });
  const {
    window: { document },
  } = dom;
  if (!document) {
    throw new Error(`Invalid HTML document: ${filepath}`);
  }
  if (title) {
    const titleEl = document.querySelector('title');
    if (titleEl) {
      titleEl.textContent = title;
    } else {
      const titleNode = document.createElement('title');
      titleNode.textContent = title;
      document.head.appendChild(titleNode);
    }
  }
  if (style) {
    const styleNode = document.createElement('link');
    styleNode.setAttribute('rel', 'stylesheet');
    styleNode.setAttribute('href', style);
    document.head.appendChild(styleNode);
  }
  let processed = dom.serialize();

  // https://github.com/jsdom/jsdom/issues/2615
  const xmlDeclarationMatch = sourceHtml.match(/^<\?xml[^?]+\?>/gi);
  if (xmlDeclarationMatch && !processed.match(/^<\?xml/i)) {
    processed = `${xmlDeclarationMatch[0]}\n${processed}`;
  }
  return processed;
}

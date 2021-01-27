import cheerio from 'cheerio';
import fs from 'fs';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import path from 'upath';
import { ManuscriptEntry } from './config';

export function generateTocHtml({
  entries,
  distDir,
  title,
  style,
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  distDir: string;
  title: string;
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
        h('title', title),
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
  }: {
    title?: string;
    style?: string;
    contentType?: 'text/html' | 'application/xhtml+xml';
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
  if (style) {
    $('head').append(`<link rel="stylesheet" />`);
    $('head > *:last-child').attr('href', style);
  }
  let processed = $.html();
  return processed;
}

export function isTocHtml(filepath: string): boolean {
  try {
    const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'));
    return !!$('[role="doc-toc"], [role="directory"], nav, .toc, #toc');
  } catch (err) {
    // seems not to be a html file
    return false;
  }
}

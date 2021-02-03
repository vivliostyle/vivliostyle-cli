import cheerio from 'cheerio';
import fs from 'fs';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import prettier from 'prettier';
import path from 'upath';
import { ManuscriptEntry } from './config';

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
        h('title', title ?? ''),
        h('link', {
          href: path.relative(distDir, manifestPath),
          rel: 'publication',
          type: 'application/ld+json',
        }),
        style && h('link', { href: style, rel: 'stylesheet' }),
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
    style?: string;
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
  if (style) {
    $('head').append(`<link rel="stylesheet" />`);
    $('head > *:last-child').attr('href', style);
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

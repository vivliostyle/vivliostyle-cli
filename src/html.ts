import { select, selectAll } from 'hast-util-select';
import toHTML from 'hast-util-to-html';
import toString from 'hast-util-to-string';
import h from 'hastscript';
import path from 'path';
import math from 'rehype-katex';
import parse from 'rehype-parse';
import stringify from 'rehype-stringify';
import vfile from 'to-vfile';
import unified from 'unified';
import { Node } from 'unist';
import { VFile } from 'vfile';
import { ParsedEntry } from './config';
import { debug } from './util';

interface VHTML extends VFile {
  data: {
    title?: string;
    style?: string[];
  };
}

export function processHTML(
  entry: ParsedEntry,
  style: string | undefined,
): VHTML {
  const input = vfile.readSync(entry.source.path);
  return unified()
    .use(parse, { emitParseErrors: true })
    .use(injectMetadata, { title: entry.title, style: style })
    .use(collectMetadata)
    .use(math)
    .use(stringify)
    .processSync(input) as VHTML;
}

export const collectMetadata: unified.Attacher = () => {
  return (tree: Node, file: VFile) => {
    const title = select('title', tree);
    if (!file.data) file.data = {};
    const data = file.data as VHTML['data'];

    if (title) {
      data.title = toString(title);
    }

    const links = selectAll('link[rel="stylesheet"]', tree);
    if (links) {
      debug(links);
    }
  };
};

export function injectMetadata(options: {}) {
  return (tree: Node) => {
    const title = select('title', tree);
    if (title) {
      debug(toString(title));
    }

    const link = select('link[rel="stylesheet"]', tree);
    if (link) {
      debug(link);
    }
  };
}

export function generateToC(entries: ParsedEntry[], distDir: string) {
  const items = entries.map((entry) =>
    h(
      'li',
      h(
        'a',
        { href: path.relative(distDir, entry.target.path) },
        entry.title || path.basename(entry.target.path, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h(
      'head',
      h('title', 'Table of Contents'),
      h('link', {
        href: 'manifest.json',
        rel: 'manifest',
        type: 'application/webpub+json',
      }),
    ),
    h('body', h('nav#toc', { role: 'doc-toc' }, h('ul', items))),
  );
  return toHTML(toc);
}

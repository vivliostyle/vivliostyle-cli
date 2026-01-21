import fs from 'node:fs';

import type * as hast from 'hast';
import { h } from 'hastscript';
import rehype from 'rehype';
import unified from 'unified';
import { u } from 'unist-builder';
import { EXIT, visit } from 'unist-util-visit';
import vfile, { type VFile } from 'vfile';
import type * as xast from 'xast';
import { fromXml } from 'xast-util-from-xml';
import { toXml } from 'xast-util-to-xml';
import { x } from 'xastscript';

export interface HtmlOptions {
  /** Paths to stylesheets to inject */
  style?: string[];
  /** Document title (sets <title> if not present) */
  title?: string;
  /** Document language (sets html lang if not present) */
  language?: string;
  /** Content type: 'text/html' or 'application/xhtml+xml' */
  contentType?: 'text/html' | 'application/xhtml+xml';
}

export type HtmlProcessorFactory = (options: HtmlOptions) => unified.Processor;

function isHast(node: hast.Element | xast.Element): node is hast.Element {
  return 'tagName' in node;
}
function getTagName(node: hast.Element | xast.Element): string {
  return isHast(node) ? node.tagName : node.name;
}

export const injectStyles: unified.Plugin<[Pick<HtmlOptions, 'style'>]> =
  (options) => (tree) => {
    const styles = options.style;
    if (!styles || styles.length === 0) {
      return;
    }
    visit(tree as hast.Root | xast.Root, 'element', (node) => {
      if (getTagName(node) !== 'head') {
        return;
      }
      styles.forEach((href) => {
        const attrs = {
          rel: 'stylesheet',
          type: 'text/css',
          href: encodeURI(href),
        };
        if (isHast(node)) {
          node.children.push(h('link', attrs));
        } else {
          node.children.push(x('link', attrs));
        }
      });
      return EXIT;
    });
  };

export const setTitle: unified.Plugin<[Pick<HtmlOptions, 'title'>]> =
  (options) => (tree) => {
    const title = options.title;
    if (title === undefined) {
      return;
    }

    // First, try to update existing title
    let titleSet = false;
    visit(tree as hast.Root | xast.Root, 'element', (node) => {
      if (getTagName(node) !== 'title') {
        return;
      }
      node.children = [u('text', title)];
      titleSet = true;
      return EXIT;
    });
    if (titleSet) {
      return;
    }

    // If no existing title, add one to head
    visit(tree as hast.Root | xast.Root, 'element', (node) => {
      if (getTagName(node) !== 'head') {
        return;
      }
      if (isHast(node)) {
        node.children.unshift(h('title', title));
      } else {
        node.children.unshift(x('title', title));
      }
      return EXIT;
    });
  };

export const setLanguage: unified.Plugin<
  [Pick<HtmlOptions, 'language' | 'contentType'>]
> = (options) => (tree) => {
  if (options.language === undefined) {
    return;
  }
  visit(tree as hast.Root | xast.Root, 'element', (node) => {
    if (getTagName(node) !== 'html') {
      return;
    }
    if (isHast(node)) {
      if (node.properties?.lang) {
        return EXIT;
      }
      node.properties = node.properties || {};
      node.properties.lang = options.language;
      if (options.contentType === 'application/xhtml+xml') {
        node.properties.xmlLang = options.language;
      }
    } else {
      if (node.attributes?.lang || node.attributes?.['xml:lang']) {
        return EXIT;
      }
      node.attributes = node.attributes || {};
      node.attributes.lang = options.language;
      node.attributes['xml:lang'] = options.language;
    }
    return EXIT;
  });
};

const defaultPlugins = (options: HtmlOptions): unified.PluggableList => [
  [injectStyles, options],
  [setTitle, options],
  [setLanguage, options],
];
export const defaultHtmlProcessor: HtmlProcessorFactory = (options) =>
  rehype()
    .data('settings', { allowDangerousHtml: true })
    .use(defaultPlugins(options));
export const defaultXhtmlProcessor: HtmlProcessorFactory = (options) =>
  unified()
    .use(function () {
      this.Parser = fromXml;
      this.Compiler = (tree) => toXml(tree as xast.Root);
    })
    .use(defaultPlugins(options));

export async function processHtml(
  processorFactory: HtmlProcessorFactory,
  filepath: string,
  options: HtmlOptions = {},
): Promise<VFile> {
  const contents = fs.readFileSync(filepath, 'utf8');
  const processor = processorFactory(options);
  return processor.process(vfile({ path: filepath, contents }));
}

export async function processHtmlString(
  processorFactory: HtmlProcessorFactory,
  contents: string,
  options: HtmlOptions = {},
): Promise<VFile> {
  const processor = processorFactory(options);
  return processor.process(vfile({ contents }));
}

export async function processHtmlTree(
  processorFactory: HtmlProcessorFactory,
  tree: hast.Root,
  options: HtmlOptions = {},
): Promise<VFile> {
  const processor = processorFactory(options);
  const transformedTree = await processor.run(tree);
  return vfile({ contents: processor.stringify(transformedTree) });
}

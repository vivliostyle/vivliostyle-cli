import fs from 'node:fs';

/**
 * NOTE: Vivliostyle CLI directly depends on hast@3, while VFM depends on
 * hast@2 and unified@9. For consistency between documentProcessor and
 * htmlProcessor, care must be taken with the libraries used in this file.
 *
 * unist@2 -- fixed by VFM
 *  `- hast@2 -- fixed by VFM
 *  |   `- hastscript@7: https://github.com/syntax-tree/hastscript/blob/7.2.0/package.json#L60
 *  `- unified@9 -- fixed by VFM
 *  |   `- rehype@11: https://github.com/rehypejs/rehype/blob/11.0.0/packages/rehype/package.json#L23
 *  `- unist-builder@3: https://github.com/syntax-tree/unist-builder/blob/3.0.1/package.json#L43
 *  `- unist-util-visit@4: https://github.com/syntax-tree/unist-util-visit/blob/4.1.2/package.json#L52
 *  `- xast@1: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/c6ed86518513036ff29ef42c044a3de58a3cd921/types/xast/v1/package.json#L11
 *      `- xast-util-from-xml@3: https://github.com/syntax-tree/xast-util-from-xml/blob/3.0.0/package.json#L42
 *      `- xast-util-to-xml@3: https://github.com/syntax-tree/xast-util-to-xml/blob/3.0.2/package.json#L34
 *      `- xastscript@3: https://github.com/syntax-tree/xastscript/blob/3.1.1/package.json#L48
 */
import type * as hast from 'hast-v2';
import { h } from 'hastscript-v7';
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

type AnyElement = hast.Element | xast.Element;

function isHast(node: AnyElement): node is hast.Element {
  return 'tagName' in node;
}
function getTagName(node: AnyElement): string {
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

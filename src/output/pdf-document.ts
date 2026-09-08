import type * as mupdfType from 'mupdf';

import { disposable } from '../disposable.js';
import type { Meta, TOCItem } from '../global-viewer.js';
import { coreVersion } from '../util.js';
import type { PdfEditHook } from './pdf-visitor.js';

const prefixes = {
  dcterms: 'http://purl.org/dc/terms/',
  meta: 'http://idpf.org/epub/vocab/package/meta/#',
} as const;

const metaTerms = {
  title: `${prefixes.dcterms}title`,
  creator: `${prefixes.dcterms}creator`,
  description: `${prefixes.dcterms}description`,
  subject: `${prefixes.dcterms}subject`,
  contributor: `${prefixes.dcterms}contributor`,
  language: `${prefixes.dcterms}language`,
  role: `${prefixes.meta}role`,
  created: `${prefixes.meta}created`,
  date: `${prefixes.meta}date`,
} as const;

interface PDFTocItem extends TOCItem {
  children: PDFTocItem[];
  ref: mupdfType.PDFObject;
  parentRef: mupdfType.PDFObject;
}

export interface PageSizeData {
  mediaWidth: number;
  mediaHeight: number;
  bleedOffset: number;
  bleedSize: number;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator: string;
  language?: string;
  creationDate?: Date;
  readingDirection?: 'rtl';
}

export interface PDFMetadataOptions {
  pageProgression?: 'ltr' | 'rtl';
  browserVersion?: string;
  viewerCoreVersion?: string;
  disableCreatorOption?: boolean;
}

export function resolvePdfMetadata(
  tree: Meta,
  {
    pageProgression,
    browserVersion,
    viewerCoreVersion,
    disableCreatorOption,
  }: PDFMetadataOptions = {},
): PDFMetadata {
  const title = tree[metaTerms.title]?.[0].v;
  const author = tree[metaTerms.creator]?.map((item) => item.v)?.join('; ');
  const subject = tree[metaTerms.description]?.[0].v;
  const keywords = tree[metaTerms.subject]?.map((item) => item.v).join(' ');
  let creatorOpt = `Vivliostyle.js ${viewerCoreVersion ?? coreVersion}`;
  if (browserVersion) {
    creatorOpt += `; ${browserVersion}`;
  }
  const language = tree[metaTerms.language]?.[0].v;
  const creation = (tree[metaTerms.created] || tree[metaTerms.date])?.[0].v;
  const creationDate = creation && new Date(creation);
  return {
    title,
    author,
    subject,
    keywords,
    creator: disableCreatorOption
      ? 'Vivliostyle'
      : `Vivliostyle (${creatorOpt})`,
    language,
    creationDate: creationDate || undefined,
    readingDirection: pageProgression === 'rtl' ? 'rtl' : undefined,
  };
}

function formatPdfDate(date: Date): string {
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, '0');
  return `D:${pad(date.getUTCFullYear(), 4)}${pad(
    date.getUTCMonth() + 1,
  )}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;
}

function applyMetadata(
  document: mupdfType.PDFDocument,
  metadata: PDFMetadata,
): void {
  if (metadata.title) {
    document.setMetaData('info:Title', metadata.title);
  }
  if (metadata.author) {
    document.setMetaData('info:Author', metadata.author);
  }
  if (metadata.subject) {
    document.setMetaData('info:Subject', metadata.subject);
  }
  if (metadata.keywords !== undefined) {
    document.setMetaData('info:Keywords', metadata.keywords);
  }
  document.setMetaData('info:Creator', metadata.creator);
  if (metadata.language) {
    document.setLanguage(metadata.language);
  }
  if (metadata.creationDate) {
    document.setMetaData(
      'info:CreationDate',
      formatPdfDate(metadata.creationDate),
    );
  }
  if (metadata.readingDirection === 'rtl') {
    using trailer = disposable(document.getTrailer());
    using catalog = disposable(trailer.get('Root'));
    const existingViewerPreferences = catalog.get('ViewerPreferences');
    if (existingViewerPreferences?.isDictionary()) {
      using viewerPreferences = disposable(existingViewerPreferences);
      using direction = disposable(document.newName('R2L'));
      viewerPreferences.put('Direction', direction);
    } else {
      existingViewerPreferences?.destroy();
      using viewerPreferences = disposable(document.newDictionary());
      using direction = disposable(document.newName('R2L'));
      viewerPreferences.put('Direction', direction);
      catalog.put('ViewerPreferences', viewerPreferences);
    }
  }
}

function applyToc(document: mupdfType.PDFDocument, tocItems: TOCItem[]): void {
  using outlineRef = disposable(document.addObject({}));
  const itemRefs: mupdfType.PDFObject[] = [];
  try {
    const addRefs = (
      items: TOCItem[],
      parentRef: mupdfType.PDFObject,
    ): PDFTocItem[] =>
      items.map((item) => {
        const ref = document.addObject({});
        itemRefs.push(ref);
        return {
          ...item,
          parentRef,
          ref,
          children: addRefs(item.children, ref),
        };
      });
    const countAll = (items: PDFTocItem[]): number =>
      items.reduce((sum, item) => sum + countAll(item.children), items.length);
    const addObjectsToPDF = (items: PDFTocItem[]) => {
      for (const [i, item] of items.entries()) {
        using child = disposable(item.ref.resolve());
        using title = disposable(document.newString(item.title));
        using destination = disposable(document.newName(item.id));
        child.put('Title', title);
        child.put('Dest', destination);
        child.put('Parent', item.parentRef);
        const prev = items[i - 1];
        if (prev) {
          child.put('Prev', prev.ref);
        }
        const next = items[i + 1];
        if (next) {
          child.put('Next', next.ref);
        }
        const lastChild = item.children.at(-1);
        if (lastChild) {
          child.put('First', item.children[0].ref);
          child.put('Last', lastChild.ref);
          child.put('Count', countAll(item.children));
        }
        addObjectsToPDF(item.children);
      }
    };

    const itemsWithRefs = addRefs(tocItems, outlineRef);
    addObjectsToPDF(itemsWithRefs);

    const lastItem = itemsWithRefs.at(-1);
    /* v8 ignore next 3 */
    if (!lastItem) {
      throw new Error('Expected at least one TOC item');
    }
    using outline = disposable(outlineRef.resolve());
    outline.put('First', itemsWithRefs[0].ref);
    outline.put('Last', lastItem.ref);
    outline.put('Count', countAll(itemsWithRefs));
    using trailer = disposable(document.getTrailer());
    using catalog = disposable(trailer.get('Root'));
    catalog.put('Outlines', outlineRef);
  } finally {
    for (const ref of itemRefs) {
      ref.destroy();
    }
  }
}

function applyPageBoxes(
  document: mupdfType.PDFDocument,
  pageSizeData: PageSizeData[],
): void {
  if (pageSizeData.length + 1 === document.countPages()) {
    // fix issue #312: Chromium LayoutNGPrinting adds unnecessary blank page
    document.deletePage(pageSizeData.length);
  }
  if (pageSizeData.length !== document.countPages()) {
    return;
  }
  for (let i = 0; i < pageSizeData.length; i++) {
    const sizeData = pageSizeData[i];
    if (
      !sizeData.mediaWidth ||
      !sizeData.mediaHeight ||
      Number.isNaN(sizeData.bleedOffset) ||
      Number.isNaN(sizeData.bleedSize)
    ) {
      continue;
    }
    using pageObject = disposable(document.findPage(i));
    using mediaBox = disposable(pageObject.getInheritable('MediaBox'));
    using mediaBottom = disposable(mediaBox.get(1));
    using mediaTop = disposable(mediaBox.get(3));
    const yOffset =
      mediaTop.asNumber() - mediaBottom.asNumber() - sizeData.mediaHeight;
    pageObject.put('MediaBox', [
      0,
      yOffset,
      sizeData.mediaWidth,
      yOffset + sizeData.mediaHeight,
    ]);
    if (!sizeData.bleedOffset && !sizeData.bleedSize) {
      continue;
    }
    pageObject.put('BleedBox', [
      sizeData.bleedOffset,
      yOffset + sizeData.bleedOffset,
      sizeData.mediaWidth - sizeData.bleedOffset,
      yOffset + sizeData.mediaHeight - sizeData.bleedOffset,
    ]);
    const trimOffset = sizeData.bleedOffset + sizeData.bleedSize;
    pageObject.put('TrimBox', [
      trimOffset,
      yOffset + trimOffset,
      sizeData.mediaWidth - trimOffset,
      yOffset + sizeData.mediaHeight - trimOffset,
    ]);
  }
}

export function createPdfDocumentHook({
  metadata,
  tocItems,
  pageSizeData,
}: {
  metadata?: PDFMetadata;
  tocItems?: TOCItem[];
  pageSizeData?: PageSizeData[];
}): PdfEditHook {
  if (!metadata && !tocItems && !pageSizeData) {
    return {};
  }
  return {
    beforeVisit: pageSizeData
      ? ({ document }) => applyPageBoxes(document, pageSizeData)
      : undefined,
    afterVisit:
      metadata || tocItems
        ? ({ document }) => {
            if (metadata) {
              applyMetadata(document, metadata);
            }
            if (tocItems) {
              applyToc(document, tocItems);
            }
          }
        : undefined,
  };
}

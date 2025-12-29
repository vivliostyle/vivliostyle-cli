import decamelize from 'decamelize';
import fs from 'node:fs';
import os from 'node:os';
import type { PDFDocument, PDFRef } from 'pdf-lib';
import upath from 'upath';
import { v1 as uuid } from 'uuid';
import type { PdfOutput, ResolvedTaskConfig } from '../config/resolve.js';
import { coreVersion } from '../const.js';
import {
  collectVolumeArgs,
  runContainer,
  toContainerPath,
} from '../container.js';
import type { CmykMap, Meta, TOCItem } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';
import { isInContainer } from '../util.js';
import { convertCmykColors } from './cmyk.js';
import { replaceImages } from './image.js';

export type SaveOption = Pick<
  PdfOutput,
  'preflight' | 'preflightOption' | 'cmyk' | 'replaceImage'
> &
  Pick<ResolvedTaskConfig, 'image'> & { cmykMap: CmykMap };

const prefixes = {
  dcterms: 'http://purl.org/dc/terms/',
  meta: 'http://idpf.org/epub/vocab/package/meta/#',
};

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
};

interface PDFTocItem extends TOCItem {
  children: PDFTocItem[];
  ref: PDFRef;
  parentRef: PDFRef;
}

export interface PageSizeData {
  mediaWidth: number;
  mediaHeight: number;
  bleedOffset: number;
  bleedSize: number;
}

export async function pressReadyWithContainer({
  input,
  output,
  preflightOption,
  image,
}: {
  input: string;
  output: string;
  preflightOption: string[];
  image: string;
}) {
  await runContainer({
    image,
    entrypoint: 'press-ready',
    userVolumeArgs: collectVolumeArgs([
      upath.dirname(input),
      upath.dirname(output),
    ]),
    commandArgs: [
      'build',
      '-i',
      toContainerPath(input),
      '-o',
      toContainerPath(output),
      ...preflightOption
        .map((opt) => `--${decamelize(opt, { separator: '-' })}`)
        .filter((str) => /^[\w-]+/.test(str)),
    ],
  });
}

export class PostProcess {
  protected readonly document: PDFDocument;

  static async load(pdf: Uint8Array): Promise<PostProcess> {
    const { PDFDocument } = await importNodeModule('pdf-lib');
    const document = await PDFDocument.load(pdf, { updateMetadata: false });
    return new PostProcess(document);
  }

  protected constructor(document: PDFDocument) {
    this.document = document;
  }

  async save(
    output: string,
    {
      preflight,
      preflightOption,
      image,
      cmyk,
      cmykMap,
      replaceImage,
    }: SaveOption,
  ) {
    let pdf = await this.document.save();

    if (cmyk) {
      Logger.logInfo('Converting CMYK colors');
      pdf = await convertCmykColors({
        pdf,
        cmykMap,
        overrideMap: cmyk.overrideMap,
        warnUnmapped: cmyk.warnUnmapped,
      });
    }

    if (replaceImage.length > 0) {
      Logger.logInfo('Replacing images');
      pdf = await replaceImages({
        pdf,
        replaceImageConfig: replaceImage,
      });
    }

    if (preflight) {
      const input = upath.join(os.tmpdir(), `vivliostyle-cli-${uuid()}.pdf`);
      await fs.promises.writeFile(input, pdf);

      if (
        preflight === 'press-ready-local' ||
        (preflight === 'press-ready' && isInContainer())
      ) {
        using _ = Logger.suspendLogging('Running press-ready');
        const { build } = await importNodeModule('press-ready');
        await build({
          ...preflightOption.reduce((acc, opt) => {
            const optName = decamelize(opt, { separator: '-' });
            return optName.startsWith('no-')
              ? {
                  ...acc,
                  [optName.slice(3)]: false,
                }
              : {
                  ...acc,
                  [optName]: true,
                };
          }, {}),
          input,
          output,
        });
      } else if (preflight === 'press-ready') {
        using _ = Logger.suspendLogging('Running press-ready');
        await pressReadyWithContainer({
          input,
          output,
          preflightOption,
          image,
        });
      }
    } else {
      await fs.promises.writeFile(output, pdf);
    }
  }

  async metadata(
    tree: Meta,
    {
      pageProgression,
      browserVersion,
      viewerCoreVersion,
      disableCreatorOption,
    }: {
      pageProgression?: 'ltr' | 'rtl';
      browserVersion?: string;
      viewerCoreVersion?: string;
      disableCreatorOption?: boolean;
    } = {},
  ) {
    const { ReadingDirection } = await importNodeModule('pdf-lib');
    const title = tree[metaTerms.title]?.[0].v;
    if (title) {
      this.document.setTitle(title);
    }

    const author = tree[metaTerms.creator]?.map((item) => item.v)?.join('; ');
    if (author) {
      this.document.setAuthor(author);
    }

    const subject = tree[metaTerms.description]?.[0].v;
    if (subject) {
      this.document.setSubject(subject);
    }

    const keywords = tree[metaTerms.subject]?.map((item) => item.v);
    if (keywords) {
      this.document.setKeywords(keywords);
    }

    let creatorOpt = `Vivliostyle.js ${viewerCoreVersion ?? coreVersion}`;
    if (browserVersion) {
      creatorOpt += `; ${browserVersion}`;
    }
    this.document.setCreator(
      disableCreatorOption ? 'Vivliostyle' : `Vivliostyle (${creatorOpt})`,
    );

    const language = tree[metaTerms.language]?.[0].v;
    if (language) {
      this.document.setLanguage(language);
    }

    const creation = (tree[metaTerms.created] || tree[metaTerms.date])?.[0].v;
    const creationDate = creation && new Date(creation);
    if (creationDate) {
      this.document.setCreationDate(creationDate);
    }
    if (pageProgression === 'rtl') {
      const viewerPrefs = this.document.catalog.getOrCreateViewerPreferences();
      viewerPrefs.setReadingDirection(ReadingDirection.R2L);
    }
  }

  async toc(items: TOCItem[]) {
    const { PDFDict, PDFHexString, PDFName, PDFNumber } =
      await importNodeModule('pdf-lib');
    if (!items || !items.length) {
      return;
    }

    const addRefs = (items: TOCItem[], parentRef: PDFRef): PDFTocItem[] =>
      items.map((item) => {
        const ref = this.document.context.nextRef();
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
        const child = PDFDict.withContext(this.document.context);
        child.set(PDFName.of('Title'), PDFHexString.fromText(item.title));
        child.set(PDFName.of('Dest'), PDFName.of(item.id));
        child.set(PDFName.of('Parent'), item.parentRef);
        const prev = items[i - 1];
        if (prev) {
          child.set(PDFName.of('Prev'), prev.ref);
        }
        const next = items[i + 1];
        if (next) {
          child.set(PDFName.of('Next'), next.ref);
        }
        if (item.children.length) {
          child.set(PDFName.of('First'), item.children[0].ref);
          child.set(
            PDFName.of('Last'),
            item.children[item.children.length - 1].ref,
          );
          child.set(PDFName.of('Count'), PDFNumber.of(countAll(item.children)));
        }
        this.document.context.assign(item.ref, child);
        addObjectsToPDF(item.children);
      }
    };

    const outlineRef = this.document.context.nextRef();
    const itemsWithRefs = addRefs(items, outlineRef);
    addObjectsToPDF(itemsWithRefs);

    const outline = PDFDict.withContext(this.document.context);
    outline.set(PDFName.of('First'), itemsWithRefs[0].ref);
    outline.set(
      PDFName.of('Last'),
      itemsWithRefs[itemsWithRefs.length - 1].ref,
    );
    outline.set(PDFName.of('Count'), PDFNumber.of(countAll(itemsWithRefs)));
    this.document.context.assign(outlineRef, outline);
    this.document.catalog.set(PDFName.of('Outlines'), outlineRef);
  }

  async setPageBoxes(pageSizeData: PageSizeData[]) {
    if (pageSizeData.length + 1 === this.document.getPageCount()) {
      // fix issue #312: Chromium LayoutNGPrinting adds unnecessary blank page
      this.document.removePage(pageSizeData.length);
    }
    if (pageSizeData.length !== this.document.getPageCount()) {
      return;
    }
    for (let i = 0; i < pageSizeData.length; i++) {
      const page = this.document.getPage(i);
      const sizeData = pageSizeData[i];
      if (
        !sizeData.mediaWidth ||
        !sizeData.mediaHeight ||
        isNaN(sizeData.bleedOffset) ||
        isNaN(sizeData.bleedSize)
      ) {
        continue;
      }
      const yOffset = page.getHeight() - sizeData.mediaHeight;
      page.setMediaBox(0, yOffset, sizeData.mediaWidth, sizeData.mediaHeight);
      if (!sizeData.bleedOffset && !sizeData.bleedSize) {
        continue;
      }
      page.setBleedBox(
        sizeData.bleedOffset,
        yOffset + sizeData.bleedOffset,
        sizeData.mediaWidth - sizeData.bleedOffset * 2,
        sizeData.mediaHeight - sizeData.bleedOffset * 2,
      );
      const trimOffset = sizeData.bleedOffset + sizeData.bleedSize;
      page.setTrimBox(
        trimOffset,
        yOffset + trimOffset,
        sizeData.mediaWidth - trimOffset * 2,
        sizeData.mediaHeight - trimOffset * 2,
      );
    }
  }
}

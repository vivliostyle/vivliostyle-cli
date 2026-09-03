import fs from 'node:fs';
import os from 'node:os';

import decamelize from 'decamelize';
import type { PDFDocument, PDFRef } from 'pdf-lib';
import upath from 'upath';
import { v1 as uuid } from 'uuid';

import type { PdfOutput, ResolvedTaskConfig } from '../config/resolve.js';
import {
  collectVolumeArgs,
  runContainer,
  toContainerPath,
} from '../container.js';
import type { CMYKValue, CmykMap, Meta, TOCItem } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';
import {
  coreVersion,
  executeWithCleanupOnInterrupt,
  isInContainer,
} from '../util.js';
import { createCmykColorHook } from './cmyk.js';
import { createReplaceImageHook } from './image.js';
import { editPdf } from './pdf-visitor.js';

export type SaveOption = Pick<
  PdfOutput,
  'preflight' | 'preflightOption' | 'cmyk' | 'replaceImage'
> &
  Pick<ResolvedTaskConfig, 'image'> & {
    cmykMap: CmykMap;
    signal?: AbortSignal;
  };

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
  signal,
}: {
  input: string;
  output: string;
  preflightOption: string[];
  image: string;
  signal?: AbortSignal;
}): Promise<void> {
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
        .filter((str) => /^[\w\-]+/v.test(str)),
    ],
    signal,
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
      cmyk: cmykConfig,
      cmykMap,
      replaceImage: replaceImageConfig,
      signal,
    }: SaveOption,
  ): Promise<void> {
    let pdf = await this.document.save();
    signal?.throwIfAborted();

    const mergedMap = new Map<string, CMYKValue>([
      ...Object.entries(cmykMap),
      ...(cmykConfig ? cmykConfig.overrideMap : []).map(
        ([{ r, g, b }, cmyk]) => [JSON.stringify([r, g, b]), cmyk] as const,
      ),
    ]);
    if (cmykConfig && cmykConfig.mapOutput) {
      const mapOutputDir = upath.dirname(cmykConfig.mapOutput);
      await fs.promises.mkdir(mapOutputDir, { recursive: true });
      await fs.promises.writeFile(
        cmykConfig.mapOutput,
        JSON.stringify(Object.fromEntries(mergedMap), null, 2),
      );
      Logger.logInfo(`CMYK color map saved to ${cmykConfig.mapOutput}`);
    }

    const replacesColors =
      cmykConfig && (mergedMap.size > 0 || cmykConfig.fallback !== undefined);
    const replacesImages = replaceImageConfig.length > 0;
    if (replacesColors && replacesImages) {
      Logger.logInfo('Converting CMYK colors and replacing images');
    } else if (replacesColors) {
      Logger.logInfo('Converting CMYK colors');
    } else if (replacesImages) {
      Logger.logInfo('Replacing images');
    }

    const failures: string[] = [];

    const cmykColorHook = cmykConfig
      ? createCmykColorHook(
          mergedMap,
          cmykConfig.fallback,
          cmykConfig ? cmykConfig.ifUnmappedColorsFound : 'ignore',
          failures,
        )
      : {};

    pdf = await (async () => {
      using replaceImageHook = await createReplaceImageHook(
        replaceImageConfig,
        cmykConfig ? cmykConfig.ifIncompatibleImagesFound : 'ignore',
        failures,
      );
      return await editPdf(pdf, [cmykColorHook, replaceImageHook], {
        signal,
      });
    })();
    signal?.throwIfAborted();

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }

    if (preflight) {
      const input = upath.join(os.tmpdir(), `vivliostyle-cli-${uuid()}.pdf`);
      await executeWithCleanupOnInterrupt(
        `Removing temporary preflight input: ${input}`,
        async () => {
          await fs.promises.writeFile(input, pdf);
          signal?.throwIfAborted();

          if (
            preflight === 'press-ready-local' ||
            (preflight === 'press-ready' && isInContainer())
          ) {
            using _ = Logger.suspendLogging('Running press-ready');
            const { build } = await importNodeModule('press-ready');
            await build({
              ...preflightOption.reduce<Record<string, boolean>>((acc, opt) => {
                const optName = decamelize(opt, { separator: '-' });
                if (optName.startsWith('no-')) {
                  acc[optName.slice(3)] = false;
                } else {
                  acc[optName] = true;
                }
                return acc;
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
              signal,
            });
          }
        },
        async () => {
          await fs.promises.rm(input, { force: true });
        },
      );
    } else {
      signal?.throwIfAborted();
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
  ): Promise<void> {
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

  async toc(tocItems: TOCItem[]): Promise<void> {
    const { PDFDict, PDFHexString, PDFName, PDFNumber } =
      await importNodeModule('pdf-lib');
    if (!tocItems || tocItems.length === 0) {
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
        const lastChild = item.children.at(-1);
        if (lastChild) {
          child.set(PDFName.of('First'), item.children[0].ref);
          child.set(PDFName.of('Last'), lastChild.ref);
          child.set(PDFName.of('Count'), PDFNumber.of(countAll(item.children)));
        }
        this.document.context.assign(item.ref, child);
        addObjectsToPDF(item.children);
      }
    };

    const outlineRef = this.document.context.nextRef();
    const itemsWithRefs = addRefs(tocItems, outlineRef);
    addObjectsToPDF(itemsWithRefs);

    const lastItem = itemsWithRefs.at(-1);
    /* v8 ignore next 3 */
    if (!lastItem) {
      throw new Error('Expected at least one TOC item');
    }
    const outline = PDFDict.withContext(this.document.context);
    outline.set(PDFName.of('First'), itemsWithRefs[0].ref);
    outline.set(PDFName.of('Last'), lastItem.ref);
    outline.set(PDFName.of('Count'), PDFNumber.of(countAll(itemsWithRefs)));
    this.document.context.assign(outlineRef, outline);
    this.document.catalog.set(PDFName.of('Outlines'), outlineRef);
  }

  setPageBoxes(pageSizeData: PageSizeData[]): void {
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
        Number.isNaN(sizeData.bleedOffset) ||
        Number.isNaN(sizeData.bleedSize)
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

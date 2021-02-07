import fs from 'fs';
import os from 'os';
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
} from 'pdf-lib';
import * as pressReadyModule from 'press-ready';
import path from 'upath';
import { v1 as uuid } from 'uuid';
import { Meta, TOCItem } from './broker';
import { startLogging, stopLogging } from './util';

export interface SaveOption {
  pressReady: boolean;
}

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

export class PostProcess {
  static async load(pdf: Buffer): Promise<PostProcess> {
    const document = await PDFDocument.load(pdf);
    return new PostProcess(document);
  }

  private constructor(private document: PDFDocument) {}

  async save(output: string, { pressReady = false }: SaveOption) {
    const input = pressReady
      ? path.join(os.tmpdir(), `vivliostyle-cli-${uuid()}.pdf`)
      : output;

    const pdf = await this.document.save();
    await fs.promises.writeFile(input, pdf);

    if (pressReady) {
      stopLogging('Running press-ready', '🚀');
      await pressReadyModule.build({ input, output });
      startLogging();
    }
  }

  async metadata(tree: Meta) {
    this.document.setProducer('Vivliostyle');

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

    const creator = tree[metaTerms.contributor]?.find(
      (item) => item.r?.[metaTerms.role]?.[0].v === 'bkp',
    )?.v;
    if (creator) {
      this.document.setCreator(creator);
    }

    const language = tree[metaTerms.language]?.[0].v;
    if (language) {
      this.document.setLanguage(language);
    }

    const creation = (tree[metaTerms.created] || tree[metaTerms.date])?.[0].v;
    const creationDate = creation && new Date(creation);
    if (creationDate) {
      this.document.setCreationDate(creationDate);
    }
  }

  async toc(items: TOCItem[]) {
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
}

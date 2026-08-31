import type * as mupdfType from 'mupdf';

import { importNodeModule } from '../node-modules.js';

interface Destroyable {
  destroy(): void;
}

function disposable<T extends Destroyable>(obj: T): T & Disposable {
  return Object.assign(obj, {
    [Symbol.dispose]() {
      obj.destroy();
    },
  });
}

export type PdfNodeOrigin = 'page' | 'annotation-appearance';

interface PdfNodeBase {
  document: mupdfType.PDFDocument;
  pageIndex: number;
  origin: PdfNodeOrigin;
  formDepth: number;
  objectNumber: number | undefined;
}

export interface PdfContentStreamNode extends PdfNodeBase {
  kind: 'content-stream';
  role: 'page-content' | 'form' | 'appearance';
  object: mupdfType.PDFObject;
  read(): string;
  write(content: string): void;
}

export interface PdfFormXObjectNode extends PdfNodeBase {
  kind: 'form-xobject';
  key: string | number;
  object: mupdfType.PDFObject;
}

export interface PdfImageXObjectNode extends PdfNodeBase {
  kind: 'image-xobject';
  resourceVisit: 'initial' | 'subsequent-page';
  key: string | number;
  object: mupdfType.PDFObject;
  resolved: mupdfType.PDFObject;
  replaceWith(replacement: mupdfType.PDFObject): void;
}

export type PdfVisitNode =
  | PdfContentStreamNode
  | PdfFormXObjectNode
  | PdfImageXObjectNode;

export interface PdfEditHook {
  visit?(node: PdfVisitNode): void | Promise<void>;
  complete?(document: mupdfType.PDFDocument): void | Promise<void>;
}

interface PdfVisitContext {
  readonly document: mupdfType.PDFDocument;
  readonly mupdf: typeof import('mupdf');
  readonly signal?: AbortSignal;
  readonly processedForms: Set<number>;
  readonly processedXObjectDictionaries: Set<number>;
  readonly visitedFormsOnPage: Set<number>;
  readonly visitedXObjectDictionariesOnPage: Set<number>;
}

async function visitNode(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
  node: PdfVisitNode,
): Promise<void> {
  for (const hook of hooks) {
    if (!hook.visit) {
      continue;
    }
    context.signal?.throwIfAborted();
    await hook.visit(node);
  }
}

function visitContentStream(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
  object: mupdfType.PDFObject,
  pageIndex: number,
  origin: PdfNodeOrigin,
  formDepth: number,
  role: PdfContentStreamNode['role'],
): Promise<void> {
  return visitNode(context, hooks, {
    kind: 'content-stream',
    document: context.document,
    pageIndex,
    origin,
    formDepth,
    role,
    object,
    objectNumber: object.asIndirect() || undefined,
    read: () => {
      using buffer = disposable(object.readStream());
      return buffer.asString();
    },
    write: (content) => {
      using buffer = disposable(new context.mupdf.Buffer(content));
      object.writeStream(buffer);
    },
  });
}

async function visitContents(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
  contents: mupdfType.PDFObject,
  pageIndex: number,
): Promise<void> {
  if (contents.isArray()) {
    // Multiple content streams
    for (let i = 0; i < contents.length; i++) {
      const streamObj = contents.get(i);
      // Use original indirect reference for stream operations (see #735)
      if (streamObj && streamObj.isStream()) {
        await visitContentStream(
          context,
          hooks,
          streamObj,
          pageIndex,
          'page',
          0,
          'page-content',
        );
      }
    }
  } else if (contents.isStream()) {
    // Single content stream
    await visitContentStream(
      context,
      hooks,
      contents,
      pageIndex,
      'page',
      0,
      'page-content',
    );
  }
}

function createImageXObjectNode(
  context: PdfVisitContext,
  xobjects: mupdfType.PDFObject,
  key: string | number,
  object: mupdfType.PDFObject,
  pageIndex: number,
  formDepth: number,
  resourceVisit: PdfImageXObjectNode['resourceVisit'],
): PdfImageXObjectNode {
  const node: PdfImageXObjectNode = {
    kind: 'image-xobject',
    resourceVisit,
    document: context.document,
    pageIndex,
    origin: 'page',
    formDepth,
    key,
    objectNumber: object.asIndirect() || undefined,
    object,
    resolved: object.resolve(),
    replaceWith: (replacement) => {
      xobjects.put(key, replacement);
      node.objectNumber = replacement.asIndirect() || undefined;
      node.object = replacement;
      node.resolved = replacement.resolve();
    },
  };
  return node;
}

async function visitResources(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
  resources: mupdfType.PDFObject,
  pageIndex: number,
  formDepth: number,
  ownerObjectNumber: number | undefined,
): Promise<void> {
  const xobjects = resources.get('XObject');
  if (!xobjects || !xobjects.isDictionary()) {
    return;
  }
  const xobjectsObjectNumber = xobjects.asIndirect() || undefined;
  const resourcesObjectNumber = resources.asIndirect() || undefined;
  const dictionaryObjectNumber =
    xobjectsObjectNumber ?? resourcesObjectNumber ?? ownerObjectNumber;
  if (
    dictionaryObjectNumber &&
    context.visitedXObjectDictionariesOnPage.has(dictionaryObjectNumber)
  ) {
    return;
  }
  const resourceVisit =
    dictionaryObjectNumber &&
    context.processedXObjectDictionaries.has(dictionaryObjectNumber)
      ? 'subsequent-page'
      : 'initial';
  if (dictionaryObjectNumber) {
    context.processedXObjectDictionaries.add(dictionaryObjectNumber);
    context.visitedXObjectDictionariesOnPage.add(dictionaryObjectNumber);
  }

  // Collect keys first to avoid modification during iteration
  const entries: { key: string | number; value: mupdfType.PDFObject }[] = [];
  xobjects.forEach((value, key) => {
    entries.push({ key, value });
  });

  for (const { key, value } of entries) {
    const subtype = value.get('Subtype')?.toString();
    if (subtype === '/Form' && value.isStream()) {
      // Use original indirect reference for stream operations (see #735)
      const objectNumber = value.asIndirect() || undefined;
      if (objectNumber && context.visitedFormsOnPage.has(objectNumber)) {
        // Avoid circular references
        continue;
      }
      const processForm =
        !objectNumber || !context.processedForms.has(objectNumber);
      if (objectNumber) {
        context.processedForms.add(objectNumber);
        context.visitedFormsOnPage.add(objectNumber);
      }

      if (processForm) {
        await visitNode(context, hooks, {
          kind: 'form-xobject',
          document: context.document,
          pageIndex,
          origin: 'page',
          formDepth: formDepth + 1,
          objectNumber,
          key,
          object: value,
        });
        await visitContentStream(
          context,
          hooks,
          value,
          pageIndex,
          'page',
          formDepth + 1,
          'form',
        );
      }

      const nestedResources = value.get('Resources');
      if (nestedResources && nestedResources.isDictionary()) {
        await visitResources(
          context,
          hooks,
          nestedResources,
          pageIndex,
          formDepth + 1,
          objectNumber,
        );
      }
      continue;
    }

    if (subtype !== '/Image') {
      continue;
    }

    await visitNode(
      context,
      hooks,
      createImageXObjectNode(
        context,
        xobjects,
        key,
        value,
        pageIndex,
        formDepth,
        resourceVisit,
      ),
    );
  }
}

async function visitAnnotationAppearances(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
  pageObject: mupdfType.PDFObject,
  pageIndex: number,
): Promise<void> {
  // Annotations may have appearance streams with colors
  const annots = pageObject.get('Annots');
  if (!annots?.isArray()) {
    return;
  }

  for (let i = 0; i < annots.length; i++) {
    const annot = annots.get(i);
    if (!annot) {
      continue;
    }
    const ap = annot.resolve().get('AP');
    if (!ap?.isDictionary()) {
      continue;
    }
    // Normal appearance
    const normalAppearance = ap.get('N');
    if (!normalAppearance) {
      continue;
    }
    if (normalAppearance.isStream()) {
      await visitContentStream(
        context,
        hooks,
        normalAppearance,
        pageIndex,
        'annotation-appearance',
        0,
        'appearance',
      );
    } else if (normalAppearance.isDictionary()) {
      // Multiple appearance states
      const appearances: mupdfType.PDFObject[] = [];
      normalAppearance.forEach((value) => {
        if (value?.isStream()) {
          appearances.push(value);
        }
      });
      for (const appearance of appearances) {
        await visitContentStream(
          context,
          hooks,
          appearance,
          pageIndex,
          'annotation-appearance',
          0,
          'appearance',
        );
      }
    }
  }
}

async function visitDocument(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
): Promise<void> {
  const pageCount = context.document.countPages();
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    context.signal?.throwIfAborted();
    context.visitedFormsOnPage.clear();
    context.visitedXObjectDictionariesOnPage.clear();
    using page = disposable(context.document.loadPage(pageIndex));
    const pageReference = page.getObject();
    const pageObject = pageReference.resolve();
    const contents = pageObject.get('Contents');
    if (contents) {
      await visitContents(context, hooks, contents, pageIndex);
    }
    const resources = pageObject.get('Resources');
    if (resources && resources.isDictionary()) {
      await visitResources(
        context,
        hooks,
        resources,
        pageIndex,
        0,
        pageReference.asIndirect() || undefined,
      );
    }
    // As of Chrome 151, no PDF generation path creates appearance resources, so they are intentionally not visited.
    // https://source.chromium.org/chromium/chromium/src/+/refs/tags/151.0.7922.173:third_party/skia/src/pdf/SkPDFDocument.cpp;l=337
    await visitAnnotationAppearances(context, hooks, pageObject, pageIndex);
  }
  await visitDocumentCompletion(context, hooks);
}

async function visitDocumentCompletion(
  context: PdfVisitContext,
  hooks: readonly PdfEditHook[],
): Promise<void> {
  for (const hook of hooks) {
    if (!hook.complete) {
      continue;
    }
    context.signal?.throwIfAborted();
    await hook.complete(context.document);
  }
}

export async function editPdf(
  pdf: Uint8Array,
  hooks: readonly PdfEditHook[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (
    hooks.every(
      (hook) => hook.visit === undefined && hook.complete === undefined,
    )
  ) {
    return pdf;
  }

  const mupdf = await importNodeModule('mupdf');
  using document = disposable(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- openDocument returns the Document base type; a PDF input yields a PDFDocument
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );
  await visitDocument(
    {
      document,
      mupdf,
      signal,
      processedForms: new Set(),
      processedXObjectDictionaries: new Set(),
      visitedFormsOnPage: new Set(),
      visitedXObjectDictionariesOnPage: new Set(),
    },
    hooks,
  );
  signal?.throwIfAborted();

  if (!document.hasUnsavedChanges()) {
    return pdf;
  }

  using outputBuffer = disposable(document.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

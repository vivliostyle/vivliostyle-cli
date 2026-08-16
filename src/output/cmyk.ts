import type * as mupdfType from 'mupdf';

import { importNodeModule } from '../node-modules.js';
import {
  type InternalColorConverter,
  convertStreamColors,
} from './pdf-stream.js';

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

async function processStream(
  stream: mupdfType.PDFObject,
  convert: InternalColorConverter,
  unmappedColors: Set<string> | null,
  mupdf: typeof import('mupdf'),
): Promise<void> {
  const buffer = stream.readStream();
  const content = buffer.asString();
  const converted = await convertStreamColors(content, convert, unmappedColors);
  stream.writeStream(new mupdf.Buffer(converted));
}

async function processFormXObjects(
  resources: mupdfType.PDFObject,
  convert: InternalColorConverter,
  unmappedColors: Set<string> | null,
  mupdf: typeof import('mupdf'),
  processed: Set<number>,
): Promise<void> {
  const xobjects = resources.get('XObject');
  if (!xobjects || !xobjects.isDictionary()) {
    return;
  }

  // Collect entries first because forEach callbacks cannot await
  const entries: mupdfType.PDFObject[] = [];
  xobjects.forEach((xobj) => {
    entries.push(xobj);
  });

  for (const xobj of entries) {
    if (!xobj || !xobj.isStream()) {
      continue;
    }

    // Use original indirect reference for stream operations (see #735)
    const objNum = xobj.asIndirect();
    if (objNum && processed.has(objNum)) {
      // Avoid circular references
      continue;
    }
    if (objNum) {
      processed.add(objNum);
    }

    const subtype = xobj.get('Subtype');
    if (!subtype || subtype.toString() !== '/Form') {
      continue;
    }

    await processStream(xobj, convert, unmappedColors, mupdf);
    const nestedResources = xobj.get('Resources');
    if (nestedResources && nestedResources.isDictionary()) {
      await processFormXObjects(
        nestedResources,
        convert,
        unmappedColors,
        mupdf,
        processed,
      );
    }
  }
}

async function processContents(
  contents: mupdfType.PDFObject,
  convert: InternalColorConverter,
  unmappedColors: Set<string> | null,
  mupdf: typeof import('mupdf'),
): Promise<void> {
  if (contents.isArray()) {
    // Multiple content streams
    for (let i = 0; i < contents.length; i++) {
      const streamObj = contents.get(i);
      // Use original indirect reference for stream operations (see #735)
      if (streamObj && streamObj.isStream()) {
        await processStream(streamObj, convert, unmappedColors, mupdf);
      }
    }
  } else if (contents.isStream()) {
    // Single content stream
    await processStream(contents, convert, unmappedColors, mupdf);
  }
}

async function processAppearanceStreams(
  appearance: mupdfType.PDFObject,
  convert: InternalColorConverter,
  unmappedColors: Set<string> | null,
  mupdf: typeof import('mupdf'),
): Promise<void> {
  if (appearance.isStream()) {
    await processStream(appearance, convert, unmappedColors, mupdf);
    return;
  }
  if (!appearance.isDictionary()) {
    return;
  }
  // Multiple appearance states
  // Collect entries first because forEach callbacks cannot await
  const states: mupdfType.PDFObject[] = [];
  appearance.forEach((val) => {
    states.push(val);
  });
  for (const val of states) {
    if (val?.isStream()) {
      await processStream(val, convert, unmappedColors, mupdf);
    }
  }
}

export async function convertCmykColors({
  pdf,
  convert,
  unmappedColors,
}: {
  pdf: Uint8Array;
  convert: InternalColorConverter;
  unmappedColors: Set<string> | null;
}): Promise<Uint8Array> {
  const mupdf = await importNodeModule('mupdf');
  const processedXObjects = new Set<number>();

  using doc = disposable(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- openDocument returns the Document base type; a PDF input yields a PDFDocument
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );

  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
    const pageObj = page.getObject().resolve();

    const contents = pageObj.get('Contents');
    if (contents) {
      await processContents(contents, convert, unmappedColors, mupdf);
    }

    const resources = pageObj.get('Resources');
    if (resources && resources.isDictionary()) {
      await processFormXObjects(
        resources,
        convert,
        unmappedColors,
        mupdf,
        processedXObjects,
      );
    }

    // Annotations may have appearance streams with colors
    const annots = pageObj.get('Annots');
    if (!annots?.isArray()) {
      continue;
    }
    for (let j = 0; j < annots.length; j++) {
      const annot = annots.get(j);
      if (!annot) {
        continue;
      }
      const ap = annot.resolve().get('AP');
      if (!ap?.isDictionary()) {
        continue;
      }
      // Normal appearance
      const n = ap.get('N');
      if (!n) {
        continue;
      }
      await processAppearanceStreams(n, convert, unmappedColors, mupdf);
    }
  }

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

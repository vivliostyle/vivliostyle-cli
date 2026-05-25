import type * as mupdfType from 'mupdf';
import type { CmykMap } from '../global-viewer.js';
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

export function mapToConverter(map: CmykMap): InternalColorConverter {
  return (rgb) => {
    const key = JSON.stringify([rgb.r, rgb.g, rgb.b]);
    return map[key] ?? null;
  };
}

async function processStream(
  stream: mupdfType.PDFObject,
  converters: InternalColorConverter[],
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
): Promise<void> {
  const buffer = stream.readStream();
  const content = buffer.asString();
  const converted = await convertStreamColors(
    content,
    converters,
    warnUnmapped,
    warnedColors,
  );
  stream.writeStream(new mupdf.Buffer(converted));
}

async function processFormXObjects(
  resources: mupdfType.PDFObject,
  converters: InternalColorConverter[],
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
  processed: Set<number>,
): Promise<void> {
  const xobjects = resources.get('XObject');
  if (!xobjects || !xobjects.isDictionary()) {
    return;
  }

  // Collect entries first to use for...of with await
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
      continue;
    }
    if (objNum) {
      processed.add(objNum);
    }

    const subtype = xobj.get('Subtype');
    if (!subtype || subtype.toString() !== '/Form') {
      continue;
    }

    await processStream(xobj, converters, warnUnmapped, warnedColors, mupdf);
    const nestedResources = xobj.get('Resources');
    if (nestedResources && nestedResources.isDictionary()) {
      await processFormXObjects(
        nestedResources,
        converters,
        warnUnmapped,
        warnedColors,
        mupdf,
        processed,
      );
    }
  }
}

async function processContents(
  contents: mupdfType.PDFObject,
  converters: InternalColorConverter[],
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
): Promise<void> {
  if (contents.isArray()) {
    for (let i = 0; i < contents.length; i++) {
      const streamObj = contents.get(i);
      // Use original indirect reference for stream operations (see #735)
      if (streamObj && streamObj.isStream()) {
        await processStream(
          streamObj,
          converters,
          warnUnmapped,
          warnedColors,
          mupdf,
        );
      }
    }
  } else if (contents.isStream()) {
    await processStream(
      contents,
      converters,
      warnUnmapped,
      warnedColors,
      mupdf,
    );
  }
}

export async function convertCmykColors({
  pdf,
  converters,
  warnUnmapped,
}: {
  pdf: Uint8Array;
  converters: InternalColorConverter[];
  warnUnmapped: boolean;
}): Promise<Uint8Array> {
  const mupdf = await importNodeModule('mupdf');
  const warnedColors = new Set<string>();
  const processedXObjects = new Set<number>();

  using doc = disposable(
    mupdf.PDFDocument.openDocument(
      pdf,
      'application/pdf',
    ) as mupdfType.PDFDocument,
  );

  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i) as mupdfType.PDFPage);
    const pageObj = page.getObject().resolve();

    const contents = pageObj.get('Contents');
    if (contents) {
      await processContents(
        contents,
        converters,
        warnUnmapped,
        warnedColors,
        mupdf,
      );
    }

    const resources = pageObj.get('Resources');
    if (resources && resources.isDictionary()) {
      await processFormXObjects(
        resources,
        converters,
        warnUnmapped,
        warnedColors,
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
      if (n.isStream()) {
        await processStream(n, converters, warnUnmapped, warnedColors, mupdf);
      } else if (n.isDictionary()) {
        // Multiple appearance states
        const stateEntries: mupdfType.PDFObject[] = [];
        n.forEach((val) => {
          stateEntries.push(val);
        });
        for (const val of stateEntries) {
          if (val?.isStream()) {
            await processStream(
              val,
              converters,
              warnUnmapped,
              warnedColors,
              mupdf,
            );
          }
        }
      }
    }
  }

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

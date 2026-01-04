import type * as mupdfType from 'mupdf';
import type { CmykMap } from '../global-viewer.js';
import { importNodeModule } from '../node-modules.js';
import { convertStreamColors } from './pdf-stream.js';

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

function processStream(
  stream: mupdfType.PDFObject,
  colorMap: CmykMap,
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
): void {
  const buffer = stream.readStream();
  const content = buffer.asString();
  const converted = convertStreamColors(
    content,
    colorMap,
    warnUnmapped,
    warnedColors,
  );
  stream.writeStream(new mupdf.Buffer(converted));
}

function processFormXObjects(
  resources: mupdfType.PDFObject,
  colorMap: CmykMap,
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
  processed: Set<number>,
): void {
  const xobjects = resources.get('XObject');
  if (!xobjects || !xobjects.isDictionary()) {
    return;
  }

  xobjects.forEach((xobj) => {
    if (!xobj || !xobj.isStream()) {
      return;
    }

    const resolved = xobj.resolve();

    const objNum = resolved.asIndirect();
    if (objNum && processed.has(objNum)) {
      // Avoid circular references
      return;
    }
    if (objNum) {
      processed.add(objNum);
    }

    const subtype = resolved.get('Subtype');
    if (!subtype || subtype.toString() !== '/Form') {
      return;
    }

    processStream(resolved, colorMap, warnUnmapped, warnedColors, mupdf);
    const nestedResources = resolved.get('Resources');
    if (nestedResources && nestedResources.isDictionary()) {
      processFormXObjects(
        nestedResources,
        colorMap,
        warnUnmapped,
        warnedColors,
        mupdf,
        processed,
      );
    }
  });
}

function processContents(
  contents: mupdfType.PDFObject,
  colorMap: CmykMap,
  warnUnmapped: boolean,
  warnedColors: Set<string>,
  mupdf: typeof import('mupdf'),
): void {
  if (contents.isArray()) {
    // Multiple content streams
    for (let i = 0; i < contents.length; i++) {
      const streamObj = contents.get(i);
      if (streamObj && streamObj.isStream()) {
        processStream(
          streamObj.resolve(),
          colorMap,
          warnUnmapped,
          warnedColors,
          mupdf,
        );
      }
    }
  } else if (contents.isStream()) {
    // Single content stream
    processStream(contents, colorMap, warnUnmapped, warnedColors, mupdf);
  }
}

export async function convertCmykColors({
  pdf,
  colorMap,
  warnUnmapped,
}: {
  pdf: Uint8Array;
  colorMap: CmykMap;
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
    const page = doc.loadPage(i) as mupdfType.PDFPage;
    const pageObj = page.getObject().resolve();

    const contents = pageObj.get('Contents');
    if (contents) {
      processContents(contents, colorMap, warnUnmapped, warnedColors, mupdf);
    }

    const resources = pageObj.get('Resources');
    if (resources && resources.isDictionary()) {
      processFormXObjects(
        resources,
        colorMap,
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
        processStream(n, colorMap, warnUnmapped, warnedColors, mupdf);
      } else if (n.isDictionary()) {
        // Multiple appearance states
        n.forEach((val) => {
          if (val?.isStream()) {
            processStream(val, colorMap, warnUnmapped, warnedColors, mupdf);
          }
        });
      }
    }
  }

  using outputBuffer = disposable(doc.saveToBuffer('compress'));
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}

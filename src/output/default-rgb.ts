import fs from 'node:fs/promises';

import type * as mupdfType from 'mupdf';

import { disposable } from '../disposable.js';
import type { PdfEditHook } from './pdf-visitor.js';

function declareDefaultRgb(
  document: mupdfType.PDFDocument,
  resources: mupdfType.PDFObject,
  colorSpace: mupdfType.PDFObject,
): void {
  using colorSpaces = disposable(resources.get('ColorSpace'));
  if (!colorSpaces.isDictionary()) {
    using created = disposable(document.newDictionary());
    created.put('DefaultRGB', colorSpace);
    resources.put('ColorSpace', created);
    return;
  }
  using declared = disposable(colorSpaces.get('DefaultRGB'));
  if (declared.isNull()) {
    colorSpaces.put('DefaultRGB', colorSpace);
  }
}

function declareDefaultRgbRecursively(
  document: mupdfType.PDFDocument,
  dictionary: mupdfType.PDFObject,
  colorSpace: mupdfType.PDFObject,
): void {
  using resources = disposable(dictionary.get('Resources'));
  if (resources.isDictionary()) {
    declareDefaultRgb(document, resources, colorSpace);
  }
  const children: (mupdfType.PDFObject & Disposable)[] = [];
  dictionary.forEach((value) => {
    if (!value.isIndirect() && value.isDictionary()) {
      children.push(disposable(value));
    }
  });
  for (using child of children) {
    declareDefaultRgbRecursively(document, child, colorSpace);
  }
}

export function createDefaultRgbHook(profilePath: string): PdfEditHook {
  return {
    async afterVisit({ document, mupdf, setMinimumPdfVersion }) {
      const profile = await fs.readFile(profilePath);
      using profileBuffer = disposable(new mupdf.Buffer(profile));
      using iccColorSpace = disposable(
        new mupdf.ColorSpace(profileBuffer, profilePath),
      );
      const type = iccColorSpace.getType();
      if (type !== 'RGB') {
        throw new TypeError(
          `defaultRgbProfile must use an RGB color space, but ${profilePath} uses ${type}`,
        );
      }
      using profileRef = disposable(
        document.addStream(profileBuffer, { N: 3, Alternate: 'DeviceRGB' }),
      );
      using colorSpace = disposable(
        document.addObject(['ICCBased', profileRef]),
      );
      const objectCount = document.countObjects();
      for (let number = 1; number < objectCount; number++) {
        using reference = disposable(document.newIndirect(number));
        using object = disposable(reference.resolve());
        if (object.isDictionary()) {
          declareDefaultRgbRecursively(document, object, colorSpace);
        }
      }
      setMinimumPdfVersion(13);
    },
  };
}

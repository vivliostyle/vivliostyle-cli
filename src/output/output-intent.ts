import fs from 'node:fs/promises';

import upath from 'upath';

import { disposable } from '../disposable.js';
import type { PdfEditHook } from './pdf-visitor.js';

export function createOutputIntentHook(profilePath: string): PdfEditHook {
  return {
    async afterVisit({ document, mupdf, setMinimumPdfVersion }) {
      const profile = await fs.readFile(profilePath);
      using profileBuffer = disposable(new mupdf.Buffer(profile));
      using colorSpace = disposable(
        new mupdf.ColorSpace(profileBuffer, profilePath),
      );
      using profileRef = disposable(
        document.addStream(profileBuffer, {
          N: colorSpace.getNumberOfComponents(),
        }),
      );
      using identifier = disposable(document.newString('Custom'));
      using info = disposable(document.newString(upath.basename(profilePath)));
      // ISO 32000-1:2008, 7.7.2, Table 28 (PDF 1.4 catalog entry), and
      // 14.11.5, Table 365 (OutputIntent dictionary):
      // https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
      // OutputConditionIdentifier may be "Custom or an application-specific,
      // machine-readable name"; Info and DestOutputProfile are required for
      // nonstandard production conditions.
      using intentRef = disposable(
        document.addObject({
          Type: 'OutputIntent',
          S: 'GTS_PDFX',
          OutputConditionIdentifier: identifier,
          Info: info,
          DestOutputProfile: profileRef,
        }),
      );
      using trailer = disposable(document.getTrailer());
      using catalog = disposable(trailer.get('Root'));
      catalog.put('OutputIntents', [intentRef]);
      setMinimumPdfVersion(14);
    },
  };
}

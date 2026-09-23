import type * as mupdfType from 'mupdf';

import { disposable } from '../disposable.js';

// MuPDF exposes PDF version x.y as x * 10 + y.
// https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/docs/reference/javascript/types/PDFDocument.rst#L136-L145
export type PdfVersion = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 20;

// By design, the catalog /Version is written for every required version.
// MuPDF's wasm binding (MuPDF.js) provides no API to set the header version,
// and a full save writes the header from the catalog /Version, so the saved
// header and catalog hold the same value, which is strictly redundant.
// https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/source/pdf/pdf-xref.c#L951-L957
// https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/source/pdf/pdf-write.c#L1655-L1658
// The catalog /Version is defined from PDF 1.4, but no provision prohibits it
// in earlier versions, and readers of earlier versions ignore entries they do
// not know.
// ISO 32000-1:2008, 7.7.2 Table 28 and Annex I.3:
// https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
export function setMinimumPdfVersion(
  document: mupdfType.PDFDocument,
  minimumVersion: PdfVersion,
): void {
  if (document.getVersion() >= minimumVersion) {
    return;
  }
  using trailer = disposable(document.getTrailer());
  using catalog = disposable(trailer.get('Root'));
  using version = disposable(
    document.newName(
      `${Math.trunc(minimumVersion / 10)}.${minimumVersion % 10}`,
    ),
  );
  catalog.put('Version', version);
}

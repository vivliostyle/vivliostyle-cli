import type * as mupdfType from 'mupdf';

import { disposable } from '../disposable.js';

// MuPDF exposes PDF version x.y as x * 10 + y.
// https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/docs/reference/javascript/types/PDFDocument.rst#L136-L145
export type PdfVersion = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 20;

// Catalog /Version was introduced in PDF 1.4.
// ISO 32000-1:2008, 7.7.2, Table 28:
// https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
export const PDF_CATALOG_VERSION_MINIMUM: PdfVersion = 14;

export function setMinimumPdfVersion(
  document: mupdfType.PDFDocument,
  minimumVersion: PdfVersion,
): void {
  if (
    document.getVersion() >= minimumVersion ||
    minimumVersion < PDF_CATALOG_VERSION_MINIMUM
  ) {
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

export function setPdfHeaderVersion(
  pdf: Uint8Array,
  version: PdfVersion,
): void {
  pdf.set(
    new TextEncoder().encode(`${Math.trunc(version / 10)}.${version % 10}`),
    5,
  );
}

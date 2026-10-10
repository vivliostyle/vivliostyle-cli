import { randomBytes, randomUUID } from 'node:crypto';

import XMLBuilder from 'fast-xml-builder';
import type * as mupdfType from 'mupdf';

import type { PdfxLevel } from '../config/resolve.js';
import { disposable } from '../disposable.js';
import type { PdfEditHook } from './pdf-visitor.js';

// ISO 32000-1:2008, 7.9.4 writes a date as D:YYYYMMDDHHmmSSOHH'mm, the form
// that cairo in Firefox writes; Skia in Chromium closes the offset with a
// second APOSTROPHE, the PDF Reference 1.7 form, and formatPdfDate() writes Z.
// https://source.chromium.org/chromium/chromium/src/+/refs/tags/153.0.8010.52:third_party/skia/src/pdf/SkPDFMetadata.cpp;l=40-52
// https://github.com/mozilla-firefox/firefox/blob/FIREFOX_155_0_1_RELEASE/gfx/cairo/cairo/src/cairo-pdf-interchange.c#L2396-L2433
const PDF_DATE =
  /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:Z|([+\-])(\d{2})'(\d{2})'?)$/v;

// XMP Specification Part 1 (April 2012), 8.2.1.2: YYYY-MM-DDThh:mm:ssTZD with
// TZD being Z, +hh:mm or -hh:mm.
// https://github.com/adobe/XMP-Toolkit-SDK/blob/main/docs/XMPSpecificationPart1.pdf
function toXmpDate(pdfDate: string | undefined): string | undefined {
  const match = PDF_DATE.exec(pdfDate ?? '');
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, sign, offsetHour, offset] =
    match;
  const zone = sign ? `${sign}${offsetHour}:${offset}` : 'Z';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`;
}

// mupdf.js getMetaData() copies a value into a 500-byte buffer and cuts it at
// 499 bytes, so the document information is read from its objects instead.
// https://github.com/ArtifexSoftware/mupdf/blob/1.28.0/platform/wasm/lib/mupdf.c#L1054-L1064
function readString(
  info: mupdfType.PDFObject,
  key: string,
): string | undefined {
  using value = disposable(info.get(key));
  return value.isString() ? value.asString() : undefined;
}

function readTrapped(info: mupdfType.PDFObject): 'True' | 'False' {
  using trapped = disposable(info.get('Trapped'));
  return trapped.isName() && trapped.asName() === 'True' ? 'True' : 'False';
}

function readInfo<T>(
  document: mupdfType.PDFDocument,
  read: (info: mupdfType.PDFObject) => T,
): T {
  using trailer = disposable(document.getTrailer());
  using info = disposable(trailer.get('Info'));
  return read(info);
}

function languageAlternative(value: string): object {
  return {
    'rdf:Alt': { 'rdf:li': { '_xml:lang': 'x-default', '#text': value } },
  };
}

function buildXmp(info: mupdfType.PDFObject): string {
  const information = (key: string) => readString(info, key);
  const title = information('Title');
  const subject = information('Subject');
  const author = information('Author');
  // Firefox gives cairo only the creator, and cairo writes ModDate only when
  // given one, so a PDF from Firefox has no ModDate. Acrobat's PDF/X-4
  // preflight still requires xmp:ModifyDate and xmp:MetadataDate, which then
  // take the creation date.
  // https://github.com/mozilla-firefox/firefox/blob/FIREFOX_155_0_1_RELEASE/gfx/thebes/PrintTargetPDF.cpp#L71-L78
  // https://github.com/mozilla-firefox/firefox/blob/FIREFOX_155_0_1_RELEASE/gfx/cairo/cairo/src/cairo-pdf-interchange.c#L1715-L1716
  const modifyDate = toXmpDate(
    information('ModDate') ?? information('CreationDate'),
  );
  const properties = Object.fromEntries(
    Object.entries({
      'pdfxid:GTS_PDFXVersion': 'PDF/X-4',
      'dc:title': title === undefined ? undefined : languageAlternative(title),
      'dc:creator':
        author === undefined ? undefined : { 'rdf:Seq': { 'rdf:li': author } },
      'dc:description':
        subject === undefined ? undefined : languageAlternative(subject),
      'pdf:Keywords': information('Keywords'),
      'pdf:Producer': information('Producer'),
      'pdf:Trapped': readTrapped(info),
      'xmp:CreatorTool': information('Creator'),
      'xmp:CreateDate': toXmpDate(information('CreationDate')),
      'xmp:ModifyDate': modifyDate,
      'xmp:MetadataDate': modifyDate,
      'xmpMM:DocumentID': `uuid:${randomUUID()}`,
      'xmpMM:VersionID': '1',
      'xmpMM:RenditionClass': 'default',
    }).filter(([, value]) => value !== undefined),
  );
  const builder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    attributeNamePrefix: '_',
  });
  const body: string = builder.build({
    'x:xmpmeta': {
      '_xmlns:x': 'adobe:ns:meta/',
      'rdf:RDF': {
        '_xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdf:Description': {
          '_rdf:about': '',
          '_xmlns:pdfxid': 'http://www.npes.org/pdfx/ns/id/',
          '_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
          '_xmlns:pdf': 'http://ns.adobe.com/pdf/1.3/',
          '_xmlns:xmp': 'http://ns.adobe.com/xap/1.0/',
          '_xmlns:xmpMM': 'http://ns.adobe.com/xap/1.0/mm/',
          ...properties,
        },
      },
    },
  });
  // XML 1.0 (Fifth Edition), 2.11: a processor turns a literal CR into LF
  // before parsing, so a CR in a value survives only as a character reference.
  // https://www.w3.org/TR/2008/REC-xml-20081126/#sec-line-ends
  const text = body.replaceAll('\u{D}', '&#xD;');
  // XMP Specification Part 1 (April 2012), 7.3.2 makes the packet wrapper
  // optional, but Acrobat's PDF/X-4 preflight rejects a packet without it as not
  // XMP-conformant. The header PI shall have exactly this form; the id is a
  // fixed GUID that packet scanners look for.
  return `<?xpacket begin="\u{FEFF}" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${text}<?xpacket end="w"?>\n`;
}

function writeFileIdentifier(document: mupdfType.PDFDocument): void {
  using trailer = disposable(document.getTrailer());
  using id = disposable(trailer.get('ID'));
  if (id.isArray()) {
    return;
  }
  const bytes = randomBytes(16);
  using first = disposable(document.newByteString(bytes));
  using second = disposable(document.newByteString(bytes));
  trailer.put('ID', [first, second]);
}

export function createPdfxHook(level: PdfxLevel): PdfEditHook {
  return {
    afterVisit({ document, mupdf }) {
      if (level === 'X-4') {
        using xmpBuffer = disposable(
          new mupdf.Buffer(readInfo(document, buildXmp)),
        );
        using metadata = disposable(
          document.addStream(xmpBuffer, { Type: 'Metadata', Subtype: 'XML' }),
        );
        using trailer = disposable(document.getTrailer());
        using catalog = disposable(trailer.get('Root'));
        catalog.put('Metadata', metadata);
      } else {
        document.setMetaData('info:GTS_PDFXVersion', 'PDF/X-1a:2003');
        using trailer = disposable(document.getTrailer());
        using info = disposable(trailer.get('Info'));
        using trappedName = disposable(document.newName(readTrapped(info)));
        info.put('Trapped', trappedName);
        // Acrobat's PDF/X-1a:2003 preflight requires ModDate, which a PDF from
        // Firefox lacks as buildXmp() explains, so it takes the creation date.
        using modDate = disposable(info.get('ModDate'));
        if (!modDate.isString()) {
          using creationDate = disposable(info.get('CreationDate'));
          if (creationDate.isString()) {
            info.put('ModDate', creationDate);
          }
        }
      }
      writeFileIdentifier(document);
    },
  };
}

import { lookup as mime } from 'mime-types';
import path from 'upath';

interface InputFormatTrait<T extends string = string> {
  format: T;
}

/** A single file of Markdown */
export interface SingleMarkdownInput extends InputFormatTrait<'markdown'> {
  entry: string;
}

/** A single file of (X)HTML */
export interface SingleHtmlInput extends InputFormatTrait<'html'> {
  entry: string;
}

/** A series of (X)HTML files which files are referred in entry (X)HTML */
export interface WebbookInput extends InputFormatTrait<'webbook'> {
  entry: string;
}

/** A JSON manifest file of W3C Web Publication or Readium Web Publication */
export interface PubManifestInput extends InputFormatTrait<'pub-manifest'> {
  entry: string;
}

/** An EPUB file (zipped) */
export interface EpubInput extends InputFormatTrait<'epub'> {
  entry: string;
}

/** An OPF file of unzipped EPUBs */
export interface EpubOpfInput extends InputFormatTrait<'epub-opf'> {
  entry: string;
}

export type InputFormat =
  | SingleMarkdownInput
  | SingleHtmlInput
  | WebbookInput
  | PubManifestInput
  | EpubInput
  | EpubOpfInput;

export function detectInputFormat(entry: string): InputFormat {
  const lowerCasedExt = path.extname(entry).toLowerCase();
  if (lowerCasedExt === '.md' || lowerCasedExt === '.markdown') {
    return { format: 'markdown', entry };
  } else if (lowerCasedExt === '.json' || lowerCasedExt === '.jsonld') {
    return { format: 'pub-manifest', entry };
  } else if (lowerCasedExt === '.epub') {
    return { format: 'epub', entry };
  } else if (lowerCasedExt === '.opf') {
    return { format: 'epub-opf', entry };
  } else if (['.html', '.htm', '.xhtml', '.xht'].includes(lowerCasedExt)) {
    return { format: 'webbook', entry };
  }
  throw new Error(`Cannot find an input format for ${entry}`);
}

export const manuscriptMediaTypes = [
  'text/markdown',
  'text/html',
  'application/xhtml+xml',
] as const;
export type ManuscriptMediaType = typeof manuscriptMediaTypes[number];

export function detectManuscriptMediaType(entry: string): ManuscriptMediaType {
  const mediaType = mime(entry);
  if (manuscriptMediaTypes.includes(mediaType as ManuscriptMediaType)) {
    return mediaType as ManuscriptMediaType;
  }
  throw new Error(`Invalid manuscript type ${mediaType} detected: ${entry}`);
}

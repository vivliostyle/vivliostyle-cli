import { upath } from '../util.js';

interface OutputFormatTrait<T extends string = string> {
  format: T;
}

/** A single file of PDF */
export interface PdfOutput extends OutputFormatTrait<'pdf'> {
  path: string;
  renderMode: 'local' | 'docker';
  preflight: 'press-ready' | 'press-ready-local' | null;
  preflightOption: string[];
}

/** A directory including publication.json, series of (X)HTML files and assets */
export interface WebPublicationOutput extends OutputFormatTrait<'webpub'> {
  path: string;
}

/** A single file of EPUB */
export interface EpubOutput extends OutputFormatTrait<'epub'> {
  path: string;
  version: '3.0'; // Reserved for future updates
}

export type OutputFormat = PdfOutput | WebPublicationOutput | EpubOutput;
export const checkOutputFormat = (v: unknown): v is OutputFormat['format'] => {
  return ['pdf', 'webpub', 'epub'].includes(v as string);
};

export const checkRenderMode = (v: unknown): v is PdfOutput['renderMode'] => {
  return ['local', 'docker'].includes(v as string);
};

export const checkPreflightMode = (v: unknown): v is PdfOutput['preflight'] => {
  return ['press-ready', 'press-ready-local'].includes(v as string);
};

export function detectOutputFormat(outputPath: string): OutputFormat['format'] {
  const lowerCasedExt = upath.extname(outputPath);
  if (lowerCasedExt === '.pdf') {
    return 'pdf';
  } else if (lowerCasedExt === '.epub') {
    return 'epub';
  } else {
    return 'webpub';
  }
}

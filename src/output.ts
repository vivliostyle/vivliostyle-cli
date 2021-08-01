import path from 'upath';

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

export type OutputFormat = PdfOutput | WebPublicationOutput;
export const checkOutputFormat = (v: unknown): v is OutputFormat['format'] => {
  return ['pdf', 'webpub'].includes(v as string);
};

export const checkRenderMode = (v: unknown): v is PdfOutput['renderMode'] => {
  return ['local', 'docker'].includes(v as string);
};

export const checkPreflightMode = (v: unknown): v is PdfOutput['preflight'] => {
  return ['press-ready', 'press-ready-local'].includes(v as string);
};

export function detectOutputFormat(outputPath: string): OutputFormat['format'] {
  const lowerCasedExt = path.extname(outputPath);
  if (lowerCasedExt === '.pdf') {
    return 'pdf';
  } else {
    return 'webpub';
  }
}

import path from 'upath';

interface OutputFormatTrait<T extends string = string> {
  format: T;
}

/** A single file of PDF */
export interface PdfOutput extends OutputFormatTrait<'pdf'> {
  path: string;
  // TODO
  // pressReady: boolean;
  // grayscale: boolean;
}

/** A directory including publication.json, series of (X)HTML files and assets */
export interface WebbookOutput extends OutputFormatTrait<'webbook'> {
  path: string;
}

export type OutputFormat = PdfOutput | WebbookOutput;
export const availableOutputFormat: ReadonlyArray<OutputFormat['format']> = [
  'pdf',
  'webbook',
] as const;

export function detectOutputFormat(outputPath: string): OutputFormat {
  const lowerCasedExt = path.extname(outputPath);
  if (lowerCasedExt === '.pdf') {
    return { format: 'pdf', path: outputPath };
  } else {
    return { format: 'webbook', path: outputPath };
  }
}

import type { Metadata, StringifyMarkdownOptions } from '@vivliostyle/vfm';
import fs from 'node:fs';
import vfile, { type VFile } from 'vfile';
import type {
  DocumentMetadataReader,
  DocumentProcessorFactory,
} from '../config/resolve.js';

export interface VSFile extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}

export async function processMarkdown(
  documentProcessorFactory: DocumentProcessorFactory,
  documentMetadataReader: DocumentMetadataReader,
  filepath: string,
  options: StringifyMarkdownOptions = {},
): Promise<VSFile> {
  const markdownString = fs.readFileSync(filepath, 'utf8');
  const processor = documentProcessorFactory(
    options,
    documentMetadataReader(markdownString),
  );
  const processed = (await processor.process(
    vfile({ path: filepath, contents: markdownString }),
  )) as VSFile;
  return processed;
}

export function readMarkdownMetadata(
  filepath: string,
  documentMetadataReader: DocumentMetadataReader,
): Metadata {
  return documentMetadataReader(fs.readFileSync(filepath, 'utf8'));
}

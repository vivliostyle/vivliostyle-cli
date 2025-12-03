import { Metadata, StringifyMarkdownOptions } from '@vivliostyle/vfm';
import fs from 'node:fs';
import vfile, { VFile } from 'vfile';
import { DocumentProcessorFactory, MetadataReader } from '../config/resolve.js';

export interface VSFile extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}

export async function processMarkdown(
  documentProcessorFactory: DocumentProcessorFactory,
  metadataReader: MetadataReader,
  filepath: string,
  options: StringifyMarkdownOptions = {},
): Promise<VSFile> {
  const markdownString = fs.readFileSync(filepath, 'utf8');
  const processor = documentProcessorFactory(
    options,
    metadataReader(markdownString),
  );
  const processed = (await processor.process(
    vfile({ path: filepath, contents: markdownString }),
  )) as VSFile;
  return processed;
}

export function readMarkdownMetadata(
  filepath: string,
  metadataReader: MetadataReader,
): Metadata {
  return metadataReader(fs.readFileSync(filepath, 'utf8'));
}

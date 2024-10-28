import {
  Metadata,
  readMetadata,
  StringifyMarkdownOptions,
} from '@vivliostyle/vfm';
import fs from 'node:fs';
import vfile, { VFile } from 'vfile';
import { DocumentProcessorFactory } from '../input/config.js';

export interface VSFile extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}

export async function processMarkdown(
  documentProcessorFactory: DocumentProcessorFactory,
  filepath: string,
  options: StringifyMarkdownOptions = {},
): Promise<VSFile> {
  const markdownString = fs.readFileSync(filepath, 'utf8');
  const processor = documentProcessorFactory(
    options,
    readMetadata(markdownString),
  );
  const processed = (await processor.process(
    vfile({ path: filepath, contents: markdownString }),
  )) as VSFile;
  return processed;
}

export function readMarkdownMetadata(filepath: string): Metadata {
  return readMetadata(fs.readFileSync(filepath, 'utf8'));
}

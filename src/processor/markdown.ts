import fs from 'node:fs';

import type { Metadata, StringifyMarkdownOptions } from '@vivliostyle/vfm';
import vfile, { type VFile } from 'vfile';

import type {
  DocumentMetadataReader,
  DocumentProcessorFactory,
} from '../config/resolve.js';
import { Logger } from '../logger.js';

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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- VFM augments the VFile with the typed VSFile fields
  const processed = (await processor.process(
    vfile({ path: filepath, contents: markdownString }),
  )) as VSFile;
  const errors: VFile['messages'] = [];
  for (const message of processed.messages) {
    if (message.fatal === true) {
      Logger.logError(String(message));
      errors.push(message);
    } else if (message.fatal === false) {
      Logger.logWarn(String(message));
    } else {
      Logger.logInfo(String(message));
    }
  }
  if (errors.length > 0) {
    throw errors.length === 1
      ? errors[0]
      : new AggregateError(errors, errors.map(String).join('\n'));
  }
  return processed;
}

export function readMarkdownMetadata(
  filepath: string,
  documentMetadataReader: DocumentMetadataReader,
): Metadata {
  return documentMetadataReader(fs.readFileSync(filepath, 'utf8'));
}

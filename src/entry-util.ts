import { pathToFileURL } from 'node:url';

export function isDirectExecution(importMetaUrl: string) {
  return (
    Boolean(process.argv[1]) &&
    importMetaUrl === pathToFileURL(process.argv[1]).href
  );
}

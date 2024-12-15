import type { PublicationManifest as _PublicationManifest } from './schema/publication.schema.js';

export { build, BuildCliFlags } from './build.js';
export { init, InitCliFlags } from './init.js';
export type {
  StructuredDocument,
  StructuredDocumentSection,
  VivliostyleConfigSchema,
} from './input/schema.js';
export { preview, PreviewCliFlags } from './preview.js';
export { createVitePlugin } from './vite-adapter.js';
/** @hidden */
export type PublicationManifest = _PublicationManifest;

import * as v from 'valibot';
import type { ViteDevServer } from 'vite';

import { VivliostyleInlineConfig } from './config/schema.js';
import { build as _build } from './core/build.js';
import { create as _create } from './core/create.js';
import { preview as _preview } from './core/preview.js';
import type { PublicationManifest as _PublicationManifest } from './schema/publication.schema.js';

export {
  readMetadata,
  VFM,
  type Metadata,
  type StringifyMarkdownOptions,
} from '@vivliostyle/vfm';
export { defineConfig } from './config/define.js';
export type {
  StructuredDocument,
  StructuredDocumentSection,
  VivliostyleConfigSchema,
  VivliostylePackageMetadata,
} from './config/schema.js';
export type { TemplateVariable } from './create-template.js';
export { createVitePlugin } from './vite-adapter.js';
/** @hidden */
export type PublicationManifest = _PublicationManifest;

/**
 * Build publication file(s) from the given configuration.
 *
 * ```ts
 * import { build } from '@vivliostyle/cli';
 * build({
 *   configPath: './vivliostyle.config.js',
 *   logLevel: 'silent',
 * });
 * ```
 *
 * @param options
 * @returns
 */
export function build(options: VivliostyleInlineConfig): Promise<void> {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return _build(parsed);
}

/**
 * Open a browser for previewing the publication.
 *
 * @param options
 * @returns
 */
export function preview(
  options: VivliostyleInlineConfig,
): Promise<ViteDevServer> {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return _preview(parsed);
}

/**
 * Scaffold a new Vivliostyle project.
 *
 * @param options
 * @returns
 */
export function create(options: VivliostyleInlineConfig): Promise<void> {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return _create(parsed);
}

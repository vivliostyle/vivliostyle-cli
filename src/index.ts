import * as v from 'valibot';
import { VivliostyleInlineConfig } from './config/schema.js';
import { build as _build } from './core/build.js';
import { create as _create } from './core/create.js';
import { preview as _preview } from './core/preview.js';
import type { PublicationManifest as _PublicationManifest } from './schema/publication.schema.js';

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
export async function build(options: VivliostyleInlineConfig) {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return await _build(parsed);
}

/**
 * Open a browser for previewing the publication.
 *
 * @param options
 * @returns
 */
export async function preview(options: VivliostyleInlineConfig) {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return await _preview(parsed);
}

/**
 * Scaffold a new Vivliostyle project.
 *
 * @param options
 * @returns
 */
export async function create(options: VivliostyleInlineConfig) {
  const parsed = v.parse(VivliostyleInlineConfig, options);
  return await _create(parsed);
}

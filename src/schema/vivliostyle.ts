import { createRequire } from 'node:module';

// TODO: Change to static import after JSON module becomes stable
const require = createRequire(import.meta.url);

const vivliostyleConfigSchema = require('../../schemas/vivliostyle/vivliostyleConfig.schema.json');

export { vivliostyleConfigSchema };

export type StructuredDocument = {
  title: string;
  href: string;
  sections?: StructuredDocumentSection[];
  children: StructuredDocument[];
};

export type StructuredDocumentSection = {
  headingHtml: string;
  headingText: string;
  href?: string;
  level?: number;
  id?: string;
  children: StructuredDocumentSection[];
};

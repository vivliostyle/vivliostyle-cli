import fs from 'node:fs';
import path from 'upath';
import { cliRoot } from '../const.js';

// TODO: Change to static import after JSON module becomes stable
const importJSON = (p: string) =>
  JSON.parse(fs.readFileSync(path.join(cliRoot, p), 'utf8'));
const bcpSchema = importJSON('schemas/pubManifest/module/bcp.schema.json');
const contextSchema = importJSON(
  'schemas/pubManifest/module/context.schema.json',
);
const contributorObjectSchema = importJSON(
  'schemas/pubManifest/module/contributor-object.schema.json',
);
const contributorSchema = importJSON(
  'schemas/pubManifest/module/contributor.schema.json',
);
const dateSchema = importJSON('schemas/pubManifest/module/date.schema.json');
const durationSchema = importJSON(
  'schemas/pubManifest/module/duration.schema.json',
);
const itemListsSchema = importJSON(
  'schemas/pubManifest/module/item-lists.schema.json',
);
const itemListSchema = importJSON(
  'schemas/pubManifest/module/ItemList.schema.json',
);
const languageSchema = importJSON(
  'schemas/pubManifest/module/language.schema.json',
);
const linkSchema = importJSON('schemas/pubManifest/module/link.schema.json');
const localizableObjectSchema = importJSON(
  'schemas/pubManifest/module/localizable-object.schema.json',
);
const localizableSchema = importJSON(
  'schemas/pubManifest/module/localizable.schema.json',
);
const resourceCategorizationSchema = importJSON(
  'schemas/pubManifest/module/resource.categorization.schema.json',
);
const stringsSchema = importJSON(
  'schemas/pubManifest/module/strings.schema.json',
);
const urlSchema = importJSON('schemas/pubManifest/module/url.schema.json');
const urlsSchema = importJSON('schemas/pubManifest/module/urls.schema.json');
const publicationSchema = importJSON(
  'schemas/pubManifest/publication.schema.json',
);

export const publicationSchemas = [
  bcpSchema,
  contextSchema,
  contributorObjectSchema,
  contributorSchema,
  dateSchema,
  durationSchema,
  itemListsSchema,
  itemListSchema,
  languageSchema,
  linkSchema,
  localizableObjectSchema,
  localizableSchema,
  resourceCategorizationSchema,
  stringsSchema,
  urlSchema,
  urlsSchema,
  publicationSchema,
] as const;

export { publicationSchema };

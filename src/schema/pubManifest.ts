import { createRequire } from 'node:module';

// TODO: Change to static import after JSON module becomes stable
const require = createRequire(import.meta.url);

const bcpSchema = require('../../schemas/pubManifest/module/bcp.schema.json');
const contextSchema = require('../../schemas/pubManifest/module/context.schema.json');
const contributorObjectSchema = require('../../schemas/pubManifest/module/contributor-object.schema.json');
const contributorSchema = require('../../schemas/pubManifest/module/contributor.schema.json');
const dateSchema = require('../../schemas/pubManifest/module/date.schema.json');
const durationSchema = require('../../schemas/pubManifest/module/duration.schema.json');
const itemListsSchema = require('../../schemas/pubManifest/module/item-lists.schema.json');
const itemListSchema = require('../../schemas/pubManifest/module/ItemList.schema.json');
const languageSchema = require('../../schemas/pubManifest/module/language.schema.json');
const linkSchema = require('../../schemas/pubManifest/module/link.schema.json');
const localizableObjectSchema = require('../../schemas/pubManifest/module/localizable-object.schema.json');
const localizableSchema = require('../../schemas/pubManifest/module/localizable.schema.json');
const resourceCategorizationSchema = require('../../schemas/pubManifest/module/resource.categorization.schema.json');
const stringsSchema = require('../../schemas/pubManifest/module/strings.schema.json');
const urlSchema = require('../../schemas/pubManifest/module/url.schema.json');
const urlsSchema = require('../../schemas/pubManifest/module/urls.schema.json');
const publicationSchema = require('../../schemas/pubManifest/publication.schema.json');

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

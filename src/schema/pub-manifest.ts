import { createRequire } from 'node:module';

// TODO: Change to static import after JSON module becomes stable
const require = createRequire(import.meta.url);

const bcpSchema = require('../../schemas/pub-manifest/module/bcp.schema.json');
const contextSchema = require('../../schemas/pub-manifest/module/context.schema.json');
const contributorObjectSchema = require('../../schemas/pub-manifest/module/contributor-object.schema.json');
const contributorSchema = require('../../schemas/pub-manifest/module/contributor.schema.json');
const dateSchema = require('../../schemas/pub-manifest/module/date.schema.json');
const durationSchema = require('../../schemas/pub-manifest/module/duration.schema.json');
const itemListsSchema = require('../../schemas/pub-manifest/module/item-lists.schema.json');
const itemListSchema = require('../../schemas/pub-manifest/module/ItemList.schema.json');
const languageSchema = require('../../schemas/pub-manifest/module/language.schema.json');
const linkSchema = require('../../schemas/pub-manifest/module/link.schema.json');
const localizableObjectSchema = require('../../schemas/pub-manifest/module/localizable-object.schema.json');
const localizableSchema = require('../../schemas/pub-manifest/module/localizable.schema.json');
const resourceCategorizationSchema = require('../../schemas/pub-manifest/module/resource.categorization.schema.json');
const stringsSchema = require('../../schemas/pub-manifest/module/strings.schema.json');
const urlSchema = require('../../schemas/pub-manifest/module/url.schema.json');
const urlsSchema = require('../../schemas/pub-manifest/module/urls.schema.json');
const publicationSchema = require('../../schemas/pub-manifest/publication.schema.json');

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

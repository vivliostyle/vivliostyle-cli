import bcpSchema from './pubManifest/module/bcp.schema.json';
import contextSchema from './pubManifest/module/context.schema.json';
import contributorObjectSchema from './pubManifest/module/contributor-object.schema.json';
import contributorSchema from './pubManifest/module/contributor.schema.json';
import dateSchema from './pubManifest/module/date.schema.json';
import durationSchema from './pubManifest/module/duration.schema.json';
import itemListsSchema from './pubManifest/module/item-lists.schema.json';
import itemListSchema from './pubManifest/module/ItemList.schema.json';
import languageSchema from './pubManifest/module/language.schema.json';
import linkSchema from './pubManifest/module/link.schema.json';
import localizableObjectSchema from './pubManifest/module/localizable-object.schema.json';
import localizableSchema from './pubManifest/module/localizable.schema.json';
import resourceCategorizationSchema from './pubManifest/module/resource.categorization.schema.json';
import stringsSchema from './pubManifest/module/strings.schema.json';
import urlSchema from './pubManifest/module/url.schema.json';
import urlsSchema from './pubManifest/module/urls.schema.json';
import publicationSchema from './pubManifest/publication.schema.json';

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

export const publicationSchemaId = publicationSchema['$id'];

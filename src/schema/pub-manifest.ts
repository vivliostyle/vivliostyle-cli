import bcpSchema from '../../schemas/pub-manifest/module/bcp.schema.json' with { type: 'json' };
import contextSchema from '../../schemas/pub-manifest/module/context.schema.json' with { type: 'json' };
import contributorObjectSchema from '../../schemas/pub-manifest/module/contributor-object.schema.json' with { type: 'json' };
import contributorSchema from '../../schemas/pub-manifest/module/contributor.schema.json' with { type: 'json' };
import dateSchema from '../../schemas/pub-manifest/module/date.schema.json' with { type: 'json' };
import durationSchema from '../../schemas/pub-manifest/module/duration.schema.json' with { type: 'json' };
import itemListsSchema from '../../schemas/pub-manifest/module/item-lists.schema.json' with { type: 'json' };
import itemListSchema from '../../schemas/pub-manifest/module/ItemList.schema.json' with { type: 'json' };
import languageSchema from '../../schemas/pub-manifest/module/language.schema.json' with { type: 'json' };
import linkSchema from '../../schemas/pub-manifest/module/link.schema.json' with { type: 'json' };
import localizableObjectSchema from '../../schemas/pub-manifest/module/localizable-object.schema.json' with { type: 'json' };
import localizableSchema from '../../schemas/pub-manifest/module/localizable.schema.json' with { type: 'json' };
import resourceCategorizationSchema from '../../schemas/pub-manifest/module/resource.categorization.schema.json' with { type: 'json' };
import stringsSchema from '../../schemas/pub-manifest/module/strings.schema.json' with { type: 'json' };
import urlSchema from '../../schemas/pub-manifest/module/url.schema.json' with { type: 'json' };
import urlsSchema from '../../schemas/pub-manifest/module/urls.schema.json' with { type: 'json' };
import publicationSchema from '../../schemas/pub-manifest/publication.schema.json' with { type: 'json' };

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

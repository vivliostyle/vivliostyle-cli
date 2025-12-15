import { camelCase, capitalCase, kebabCase, snakeCase } from 'change-case';
import Handlebars from 'handlebars';
import { titleCase } from 'title-case';
import {
  type ParsedVivliostyleInlineConfig,
  ThemeSpecifier,
  VivliostylePackageMetadata,
} from './config/schema.js';
import type { PackageJson } from './npm.js';

export type VivliostylePackageJson = Pick<PackageJson, 'name' | 'version'> & {
  vivliostyle?: VivliostylePackageMetadata;
};

export interface TemplateVariable
  extends Omit<ParsedVivliostyleInlineConfig, 'theme'> {
  projectPath: string;
  title: string;
  author: string;
  language: string;
  theme?: ThemeSpecifier;
  themePackage?: VivliostylePackageJson;
  cliVersion: string;
  coreVersion: string;
}

function upper(text: string) {
  return text && text.toUpperCase();
}
Handlebars.registerHelper('upper', upper);

function lower(text: string) {
  return text && text.toLowerCase();
}
Handlebars.registerHelper('lower', lower);

function capital(text: string) {
  return text && capitalCase(text);
}
Handlebars.registerHelper('capital', capital);

function camel(text: string) {
  return text && camelCase(text);
}
Handlebars.registerHelper('camel', camel);

function snake(text: string) {
  return text && snakeCase(text);
}
Handlebars.registerHelper('snake', snake);

function kebab(text: string) {
  return text && kebabCase(text);
}
Handlebars.registerHelper('kebab', kebab);

function proper(text: string) {
  return text && titleCase(text);
}
Handlebars.registerHelper('proper', proper);

function lorem() {
  return 'Lorem ipsum dolor sit amet consectetur adipisicing elit. Odio, maxime et saepe facilis dolor aut maiores cupiditate rem voluptatem placeat accusamus voluptates laborum ratione enim blanditiis nisi voluptas non mollitia.';
}
Handlebars.registerHelper('lorem', lorem);

function json(data: unknown) {
  return JSON.stringify(data);
}
Handlebars.registerHelper('json', json);

export function format(text: string, context: unknown) {
  const template = Handlebars.compile(text.toString(), { noEscape: true });
  return template(context);
}

import { camelCase, capitalCase, kebabCase, snakeCase } from 'change-case';
import Handlebars from 'handlebars';
import { titleCase } from 'title-case';

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

export function format(text: string, context: unknown) {
  const template = Handlebars.compile(text.toString(), { noEscape: true });
  return template(context);
}

import enquirer from 'enquirer';
import * as v from 'valibot';
import { PromptOption } from './config/schema.js';

export async function askQuestion<
  T extends object,
  S extends v.ObjectSchema<any, any> | v.ObjectSchemaAsync<any, any>,
>({
  question,
  schema,
}: {
  question: PromptOption | PromptOption[];
  schema?: S;
}): Promise<S extends undefined ? T : v.InferOutput<NonNullable<S>>>;

export async function askQuestion<T extends object>({
  question,
  schema,
}: {
  question: PromptOption | PromptOption[];
  schema?: undefined;
}): Promise<T>;

export async function askQuestion<
  T extends object,
  S extends v.ObjectSchema<any, any> | v.ObjectSchemaAsync<any, any>,
>({
  question,
  schema,
}: {
  question: PromptOption | PromptOption[];
  schema?: S;
}): Promise<any> {
  const response = await enquirer.prompt<T>(
    [question].flat().map((q) => ({
      ...q,
      validate:
        schema &&
        (async (value: unknown) => {
          const { success, issues } = schema.async
            ? await v.safeParseAsync(v.partialAsync(schema), {
                [q.name]: value,
              })
            : v.safeParse(v.partial(schema), { [q.name]: value });
          return success || issues[0].message;
        }),
    })),
  );
  if (!schema) {
    return response as any;
  }

  return schema.async
    ? await v.parseAsync(schema, response)
    : v.parse(schema, response);
}

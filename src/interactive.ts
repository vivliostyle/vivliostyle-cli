import enquirer from 'enquirer';
import * as v from 'valibot';
import { PromptOption } from './config/schema.js';

export async function askQuestion<
  T extends object,
  S extends
    | v.ObjectSchema<any, any>
    | v.ObjectSchemaAsync<any, any>
    | undefined = undefined,
>({
  question,
  schema,
}: {
  question: PromptOption | PromptOption[];
  schema?: S;
}): Promise<typeof schema extends undefined ? T : v.InferOutput<S>> {
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
  return schema
    ? schema.async
      ? v.parseAsync(schema, response)
      : v.parse(schema, response)
    : response;
}

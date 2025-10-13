import {
  autocomplete,
  autocompleteMultiselect,
  cancel,
  isCancel,
  multiselect,
  outro,
  log as promptLog,
  spinner as promptSpinner,
  select,
  text,
} from '@clack/prompts';
import terminalLink from 'terminal-link';
import * as v from 'valibot';
import { cyan, gray, green, yellow } from 'yoctocolors';
import {
  PromptOption,
  SelectPromptOption,
  ValidString,
} from './config/schema.js';
import { spinnerFrames, spinnerInterval } from './logger.js';

type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export async function lazyPrompt<T>(
  fn: () => Promise<T>,
  message?: string,
): Promise<T> {
  const deferredTimeMs = 300;
  let spinner: ReturnType<typeof promptSpinner> | undefined;
  const timer = setTimeout(() => {
    spinner = promptSpinner({ frames: spinnerFrames, delay: spinnerInterval });
    spinner.start(message);
  }, deferredTimeMs);
  const result = await fn().then((r) => {
    if (!spinner) {
      return r;
    }
    return new Promise<T>((resolve) =>
      setTimeout(() => resolve(r), deferredTimeMs),
    );
  });
  clearTimeout(timer);
  spinner?.stop(message);
  return result;
}

export async function askQuestion<
  T extends object,
  S extends v.ObjectSchema<any, any> | v.ObjectSchemaAsync<any, any>,
>(_: {
  question: Record<
    keyof v.InferInput<S>,
    DistributiveOmit<PromptOption, 'name'>
  >;
  schema: S;
  validateProgressMessage?: string;
}): Promise<S extends undefined ? T : v.InferOutput<NonNullable<S>>>;

export async function askQuestion<T extends object>(_: {
  question: Record<string, DistributiveOmit<PromptOption, 'name'>>;
  schema?: undefined;
  validateProgressMessage?: string;
}): Promise<T>;

export async function askQuestion<
  S extends v.ObjectSchema<any, any> | v.ObjectSchemaAsync<any, any>,
>({
  question: questions,
  schema,
  validateProgressMessage,
}: {
  question: Record<
    keyof v.InferInput<S>,
    DistributiveOmit<PromptOption, 'name'>
  >;
  schema?: S;
  validateProgressMessage?: string;
}): Promise<any> {
  const response: Record<string, unknown> = {};

  // Repeat until the input passes the validation
  while (true) {
    for (const [name, question] of Object.entries(questions)) {
      let result: string | string[] | symbol;

      // Maximum number of items to display at once.
      const maxItems = 10;
      const normalizeOptions = (options: SelectPromptOption[]) =>
        options.map((v) => (typeof v === 'string' ? { value: v } : v));
      const validate = (value: unknown = '') => {
        if (!question.required || 'defaultValue' in question) {
          return;
        }
        const { success, issues } = v.safeParse(ValidString, value);
        return success ? undefined : issues[0].message;
      };

      if (import.meta.env?.VITEST) {
        // @ts-expect-error: Set the name to return the mocked answer
        question.name = name;
      }
      if (question.type === 'text') {
        result = await text({ ...question, validate });
      } else if (question.type === 'select') {
        result = await select<string>({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else if (question.type === 'multiSelect') {
        result = await multiselect<string>({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else if (question.type === 'autocomplete') {
        result = await autocomplete({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
          validate,
        });
      } else if (question.type === 'autocompleteMultiSelect') {
        result = await autocompleteMultiselect({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else {
        result = question satisfies never;
      }
      if (isCancel(result)) {
        cancel('Operation cancelled.');
        process.exit(0);
      }
      response[name] = result;
    }

    let result: v.SafeParseResult<any>;
    if (schema && schema.async) {
      result = await lazyPrompt(
        () => v.safeParseAsync(schema, response),
        validateProgressMessage,
      );
    } else if (schema) {
      result = v.safeParse(schema, response);
    } else {
      return response;
    }

    const { success, output, issues } = result;
    if (success) {
      return output;
    }
    promptLog.warn(issues[0].message);
  }
}

export function caveat(
  message: string,
  { relativeOutput }: { relativeOutput: string },
): void {
  const steps = [];
  if (relativeOutput !== '.') {
    steps.push(`Navigate to ${green(relativeOutput)}`);
  }
  steps.push('Create and edit Markdown files');
  steps.push(
    `Modify the ${cyan('entry')} field in ${green('vivliostyle.config.js')}`,
  );
  steps.push(`${cyan('npm run preview')} to open a preview browser window`);
  steps.push(`${cyan('npm run build')} to generate the output file`);

  outro(
    `${message}

Next steps:
${steps.map((s, i) => gray(`${i + 1}. `) + s).join('\n')}

For more information, visit ${terminalLink(yellow('https://docs.vivliostyle.org'), 'https://docs.vivliostyle.org', { fallback: (text) => text })}.

🖋 Happy writing!`,
  );
}

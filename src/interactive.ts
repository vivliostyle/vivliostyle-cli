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
  fn: (spinner: Promise<ReturnType<typeof promptSpinner>>) => Promise<T>,
  message?: string,
  deferredTimeMs = 300,
): Promise<T> {
  let spinner: ReturnType<typeof promptSpinner> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const spinnerPromise = new Promise<ReturnType<typeof promptSpinner>>(
    (resolve) => {
      timer = setTimeout(() => {
        spinner = promptSpinner({
          frames: spinnerFrames,
          delay: spinnerInterval,
        });
        spinner.start(message);
        resolve(spinner);
      }, deferredTimeMs);
    },
  );
  const result = await fn(spinnerPromise)
    .then((r) => {
      if (!spinner) {
        return r;
      }
      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(r), deferredTimeMs),
      );
    })
    .catch(async (e) => {
      await spinnerPromise;
      spinner?.stop(message);
      outro(gray(String(e)));
      throw e;
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
      let result: unknown;

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
        result = await select({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else if (question.type === 'multiSelect') {
        result = await multiselect({
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
  {
    relativeOutput,
    installDependencies,
  }: { relativeOutput: string; installDependencies: boolean },
): void {
  const steps = [];
  if (relativeOutput !== '.') {
    steps.push(`Navigate to ${green(relativeOutput)}`);
  }
  if (!installDependencies) {
    steps.push(`${cyan('npm install')} to install dependencies`);
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

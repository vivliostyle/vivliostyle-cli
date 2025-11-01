import {
  AutocompletePrompt,
  getColumns,
  isCancel,
  MultiSelectPrompt,
  SelectPrompt,
  type State,
  TextPrompt,
} from '@clack/core';
import type {
  AutocompleteOptions,
  MultiSelectOptions,
  Option,
  SelectOptions,
  TextOptions,
} from '@clack/prompts';
import { limitOptions } from '@clack/prompts';
import { wrapAnsi } from 'fast-wrap-ansi';
import { cursor, erase } from 'sisteransi';
import * as v from 'valibot';
import {
  blueBright,
  dim,
  gray,
  green,
  hidden,
  inverse,
  redBright,
  strikethrough,
  yellow,
  yellowBright,
} from 'yoctocolors';
import {
  PromptOption,
  SelectPromptOption,
  ValidString,
} from './config/schema.js';
import { isUnicodeSupported, Logger } from './logger.js';

type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

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
        // For testing, safely assign the name property using a type assertion
        (question as any).name = name;
      }
      if (question.type === 'text') {
        result = await textPrompt({ ...question, validate });
      } else if (question.type === 'select') {
        result = await selectPrompt({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else if (question.type === 'multiSelect') {
        result = await multiSelectPrompt({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else if (question.type === 'autocomplete') {
        result = await autocompletePrompt({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
          validate,
        });
      } else if (question.type === 'autocompleteMultiSelect') {
        result = await autocompleteMultiSelectPrompt({
          ...question,
          options: normalizeOptions(question.options),
          maxItems,
        });
      } else {
        result = question satisfies never;
      }
      if (isCancel(result)) {
        process.exit(0);
      }
      response[name] = result;
    }

    let result: v.SafeParseResult<any>;
    if (schema && schema.async) {
      result = await interactiveLogLoading(validateProgressMessage ?? '', () =>
        v.safeParseAsync(schema, response),
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
    interactiveLogWarn(issues[0].message);
  }
}

const promptStateSymbol = {
  initial: isUnicodeSupported ? '◆' : '*',
  active: isUnicodeSupported ? '◆' : '*',
  cancel: isUnicodeSupported ? '■' : 'x',
  submit: isUnicodeSupported ? '◇' : 'o',
  error: isUnicodeSupported ? '▲' : 'x',
} as const satisfies { [key in State]: string };
const radioActiveSymbol = isUnicodeSupported ? '◉' : '>';
const radioInactiveSymbol = isUnicodeSupported ? '◯' : ' ';
const checkboxActiveSymbol = isUnicodeSupported ? '◼' : '[+]';
const checkboxInactiveSymbol = isUnicodeSupported ? '◻' : '[ ]';

const labelToString = <Value>(option: Option<Value>) =>
  option.label ?? String(option.value ?? '');
const renderListOption =
  <Value>(multiSelect: boolean, selectedValues?: Value[]) =>
  (option: Option<Value>, active: boolean) => {
    const Y = multiSelect ? checkboxActiveSymbol : radioActiveSymbol;
    const N = multiSelect ? checkboxInactiveSymbol : radioInactiveSymbol;
    if (option.disabled) {
      return `${gray(N)} ${gray(labelToString(option))} ${gray('(disabled)')}`;
    }
    return `${
      (multiSelect && selectedValues?.includes(option.value)) ||
      (!multiSelect && active)
        ? green(Y)
        : dim(N)
    } ${
      active
        ? `${labelToString(option)}${option.hint ? ` ${dim(`(${option.hint})`)}` : ''}`
        : dim(labelToString(option))
    }`;
  };

function textPrompt(opts: TextOptions) {
  return new TextPrompt({
    ...opts,
    input: Logger.stdin,
    output: Logger.stdout,
    signal: Logger.signal,
    render() {
      const symbol = promptStateSymbol[this.state];
      const placeholder = opts.placeholder
        ? inverse(opts.placeholder[0]) + dim(opts.placeholder.slice(1))
        : inverse(hidden('_'));
      const userInput = !this.userInput
        ? placeholder
        : this.userInputWithCursor;
      const value = this.value ?? '';

      switch (this.state) {
        case 'error': {
          const errorText = this.error ? `   ${yellow(this.error)}` : '';
          return `${yellow('║')}\n${yellow(`${symbol}─`)} ${opts.message}\n   ${userInput}\n${errorText}`;
        }
        case 'submit': {
          const valueText = value ? `  ${dim(value)}` : '';
          return `${blueBright('║')}\n${blueBright(`${symbol}─`)} ${opts.message}\n${blueBright('║')}${valueText}`;
        }
        case 'cancel': {
          const valueText = value ? `   ${strikethrough(dim(value))}` : '';
          return `${gray('║')}\n${gray(`${symbol}─`)} ${opts.message}\n${valueText}`;
        }
        default:
          return `${blueBright('║')}\n${blueBright(`${symbol}─`)} ${opts.message}\n   ${userInput}\n`;
      }
    },
  }).prompt() as Promise<string | symbol>;
}

function selectPrompt<Value>(opts: SelectOptions<Value>, multiple = false) {
  return new (multiple ? MultiSelectPrompt : SelectPrompt)({
    ...opts,
    input: Logger.stdin,
    output: Logger.stdout,
    signal: Logger.signal,
    render() {
      const symbol = promptStateSymbol[this.state];
      const values = [this.value].flat() as Value[];
      const selected = this.options.filter((o) => values.includes(o.value));
      const label =
        selected.length > 0 ? selected.map(labelToString).join(', ') : 'none';

      switch (this.state) {
        case 'submit': {
          return `${blueBright('║')}\n${blueBright(`${symbol}─`)} ${opts.message}\n${blueBright('║')}  ${dim(label)}`;
        }
        case 'cancel': {
          return `${gray('║')}\n${gray(`${symbol}─`)} ${opts.message}\n   ${strikethrough(dim(label))}`;
        }
        default: {
          const indents = '   ';
          const displayingOptions = limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: opts.maxItems,
            columnPadding: indents.length,
            style: renderListOption(
              multiple,
              Array.isArray(this.value) ? this.value : [],
            ),
          });
          return `${blueBright('║')}\n${blueBright(`${symbol}─`)} ${opts.message}\n   ${displayingOptions.join(`\n${indents}`)}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
}

function multiSelectPrompt<Value>(opts: MultiSelectOptions<Value>) {
  return selectPrompt<Value>(opts, true) as Promise<Value[] | symbol>;
}

function autocompletePrompt<Value>(
  opts: AutocompleteOptions<Value>,
  multiple = false,
) {
  return new AutocompletePrompt({
    ...opts,
    multiple,
    initialValue: opts.initialValue ? [opts.initialValue] : undefined,
    filter: (searchText, option) => {
      if (!searchText) {
        return true;
      }
      const label = (option.label ?? String(option.value ?? '')).toLowerCase();
      const hint = (option.hint ?? '').toLowerCase();
      const value = String(option.value).toLowerCase();
      const term = searchText.toLowerCase();
      return (
        label.includes(term) || hint.includes(term) || value.includes(term)
      );
    },
    input: Logger.stdin,
    output: Logger.stdout,
    signal: Logger.signal,
    render() {
      const symbol = promptStateSymbol[this.state];
      const selected = this.options.filter((o) =>
        this.selectedValues.includes(o.value),
      );
      const label =
        selected.length > 0 ? selected.map(labelToString).join(', ') : 'none';

      switch (this.state) {
        case 'submit': {
          return `${blueBright('║')}\n${blueBright(`${symbol}─`)} ${opts.message}\n${blueBright('║')}  ${dim(label)}`;
        }
        case 'cancel': {
          const userInputText = this.userInput
            ? `  ${strikethrough(dim(this.userInput))}`
            : '';
          return `${gray('║')}\n${gray(`${symbol}─`)} ${opts.message}\n${userInputText}`;
        }
        default: {
          const indents = '   ';
          let searchText = '';
          if (this.isNavigating || (opts.placeholder && !this.userInput)) {
            const searchTextValue = opts.placeholder ?? this.userInput;
            searchText = searchTextValue ? ` ${dim(searchTextValue)}` : '';
          } else {
            searchText = ` ${this.userInputWithCursor}`;
          }
          const matches =
            this.filteredOptions.length !== this.options.length
              ? dim(
                  ` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? '' : 'es'})`,
                )
              : '';
          const headings = [
            blueBright('║'),
            `${blueBright(`${symbol}─`)} ${opts.message}`,
            `${indents}${dim('Search:')}${searchText}${matches}`,
          ];
          if (this.filteredOptions.length === 0 && this.userInput) {
            headings.push(`${indents}${yellow('No matches found')}`);
          }
          if (this.state === 'error') {
            headings.push(`${indents}${yellow(`Error: ${this.error ?? ''}`)}`);
          }
          const footers = [
            multiple
              ? `${indents}${dim('↑/↓ to navigate • Space/Tab: select • Enter: confirm • Type: to search')}`
              : `${indents}${dim('↑/↓ to select • Enter: confirm • Type: to search')}`,
          ];
          const displayingOptions = limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.filteredOptions,
            maxItems: opts.maxItems,
            columnPadding: indents.length,
            rowPadding: headings.length + footers.length,
            style: renderListOption(multiple, this.selectedValues),
          });
          return [
            ...headings,
            ...displayingOptions.map((s) => `${indents}${s}`),
            ...footers,
          ].join('\n');
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
}

function autocompleteMultiSelectPrompt<Value>(
  opts: AutocompleteOptions<Value>,
) {
  return autocompletePrompt<Value>(opts, true) as Promise<Value[] | symbol>;
}

export async function interactiveLogLoading<T>(
  message: string,
  fn: () => Promise<T>,
  deferredTimeMs = 300,
): Promise<T> {
  if (!Logger.isInteractive) {
    return await fn();
  }

  const output = Logger.stdout;
  const columns = getColumns(output);
  const showMessage = (msg: string) => {
    const wrapped = wrapAnsi(msg, columns, { hard: true, trim: false });
    output.write(wrapped);
    return () => {
      const prevLines = wrapped.split('\n');
      if (prevLines.length > 1) {
        output.write(cursor.up(prevLines.length - 1));
      }
      output.write(cursor.to(0));
      output.write(erase.down());
    };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let clearMessage: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      output.write(`${blueBright('║')}\n`);
      clearMessage = showMessage(
        `${blueBright(`${promptStateSymbol.active}─`)} ${dim(message)}\n`,
      );
      resolve();
    }, deferredTimeMs);
  });
  const result = await fn()
    .then((r) => {
      if (!clearMessage) {
        return r;
      }
      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(r), deferredTimeMs),
      );
    })
    .catch(async (e) => {
      await promise;
      clearMessage?.();
      showMessage(
        `${redBright(`${promptStateSymbol.error}─`)} ${dim(message)}\n\n`,
      );
      throw e;
    });
  clearTimeout(timer);
  if (clearMessage) {
    clearMessage();
    showMessage(
      `${blueBright(`${promptStateSymbol.submit}─`)} ${dim(message)}\n`,
    );
  }
  return result;
}

export function interactiveLogWarn(message: string) {
  if (import.meta.env?.VITEST) {
    return;
  }
  Logger.stdout.write(
    `${yellowBright(promptStateSymbol.error)}  ${yellowBright(message)}\n`,
  );
}

export function interactiveLogOutro(message: string) {
  if (import.meta.env?.VITEST) {
    return;
  }
  Logger.stdout.write(`${blueBright('║')}\n${blueBright('╙─')} ${message}\n\n`);
}

import {
  InlineOptions,
  ParsedBuildTask,
  ParsedVivliostyleConfigSchema,
  ParsedVivliostyleInlineConfig,
} from './schema.js';

const pruneObject = <T extends Record<string, unknown>>(obj: T) => {
  const ret = { ...obj };
  for (const key in ret) {
    if (ret[key] === undefined || ret[key] === null) {
      delete ret[key];
    }
  }
  return ret as { [K in keyof T]: NonNullable<T[K]> };
};

export function mergeConfig(
  base: ParsedVivliostyleConfigSchema,
  override: Partial<ParsedBuildTask>,
): ParsedVivliostyleConfigSchema {
  return {
    tasks: base.tasks.map((task, i) => ({
      ...pruneObject(task),
      ...pruneObject(override),
    })),
    inlineOptions: base.inlineOptions,
  };
}

type HasOnlyInlineOptionsProperties<T> =
  Exclude<keyof T, keyof InlineOptions> extends never ? T : never;

export function mergeInlineConfig(
  { tasks, inlineOptions }: ParsedVivliostyleConfigSchema,
  inlineConfig: ParsedVivliostyleInlineConfig,
): ParsedVivliostyleConfigSchema {
  const {
    theme,
    size,
    pressReady,
    title,
    author,
    language,
    readingProgression,
    timeout,
    image,
    viewer,
    viewerParam,
    browser,
    output,
    renderMode,
    preflight,
    preflightOption,
    vite,
    viteConfigFile,
    host,
    port,
    ...overrideInlineOptions
  } = inlineConfig;

  return {
    tasks: tasks.map((task) => ({
      ...pruneObject(task),
      ...pruneObject({
        theme,
        size,
        pressReady,
        title,
        author,
        language,
        readingProgression,
        timeout,
        image,
        viewer,
        viewerParam,
        browser,
        vite,
        viteConfigFile,
      }),
      output: (output?.length ? output : task.output)?.map((o) => ({
        ...pruneObject(o),
        ...pruneObject({
          renderMode,
          preflight,
          preflightOption,
        }),
      })),
      server: {
        ...pruneObject(task.server ?? {}),
        ...pruneObject({ host, port }),
      },
    })),
    inlineOptions: {
      ...pruneObject(inlineOptions),
      ...pruneObject(
        overrideInlineOptions satisfies HasOnlyInlineOptionsProperties<
          typeof overrideInlineOptions
        >,
      ),
    },
  };
}

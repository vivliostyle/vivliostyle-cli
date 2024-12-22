import {
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

export function mergeInlineConfig(
  { tasks, inlineOptions }: ParsedVivliostyleConfigSchema,
  inlineConfig: ParsedVivliostyleInlineConfig,
): ParsedVivliostyleConfigSchema {
  return {
    tasks: tasks.map((task) => ({
      ...pruneObject(task),
      ...pruneObject({
        theme: inlineConfig.theme?.map((specifier) => ({ specifier })),
        size: inlineConfig.size,
        pressReady: inlineConfig.pressReady,
        title: inlineConfig.title,
        author: inlineConfig.author,
        language: inlineConfig.language,
        readingProgression: inlineConfig.readingProgression,
        timeout: inlineConfig.timeout,
        image: inlineConfig.image,
        viewer: inlineConfig.viewer,
        viewerParam: inlineConfig.viewerParam,
        browser: inlineConfig.browser,
      }),
      output: (inlineConfig.output ?? task.output)?.map((o) => ({
        ...pruneObject(o),
        ...pruneObject({
          renderMode: inlineConfig.renderMode,
          preflight: inlineConfig.preflight,
          preflightOption: inlineConfig.preflightOption,
        }),
      })),
    })),
    inlineOptions: {
      ...pruneObject(inlineOptions),
      ...pruneObject({
        cwd: inlineConfig.cwd,
        config: inlineConfig.config,
        cropMarks: inlineConfig.cropMarks,
        bleed: inlineConfig.bleed,
        cropOffset: inlineConfig.cropOffset,
        css: inlineConfig.css,
        style: inlineConfig.style,
        userStyle: inlineConfig.userStyle,
        singleDoc: inlineConfig.singleDoc,
        quick: inlineConfig.quick,
        sandbox: inlineConfig.sandbox,
        executableBrowser: inlineConfig.executableBrowser,
        proxyServer: inlineConfig.proxyServer,
        proxyBypass: inlineConfig.proxyBypass,
        proxyUser: inlineConfig.proxyUser,
        proxyPass: inlineConfig.proxyPass,
        logLevel: inlineConfig.logLevel,
        ignoreHttpsErrors: inlineConfig.ignoreHttpsErrors,
        openViewer: inlineConfig.openViewer,
      }),
    },
  };
}

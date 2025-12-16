import { Command, type OptionValues } from 'commander';
import * as v from 'valibot';
import {
  type InlineOptions,
  type OutputConfig,
  type ParsedVivliostyleConfigSchema,
  VivliostyleInlineConfig,
} from '../config/schema.js';
import { EMPTY_DATA_URI } from '../const.js';

export interface CliFlags {
  input?: string;
  config?: string;
  outputs?: Pick<OutputConfig, 'path' | 'format'>[];
  theme?: string[];
  size?: string;
  cropMarks?: boolean;
  bleed?: string;
  cropOffset?: string;
  css?: string;
  style?: string;
  userStyle?: string;
  singleDoc?: boolean;
  quick?: boolean;
  pressReady?: boolean;
  title?: string;
  author?: string;
  language?: string;
  readingProgression?: 'ltr' | 'rtl';
  timeout?: number;
  renderMode?: 'local' | 'docker';
  preflight?: 'press-ready' | 'press-ready-local';
  preflightOption?: string[];
  sandbox?: boolean;
  executableBrowser?: string;
  image?: string;
  /** @deprecated */ http?: boolean;
  viewer?: string;
  viewerParam?: string;
  browser?: string;
  proxyServer?: string;
  proxyBypass?: string;
  proxyUser?: string;
  proxyPass?: string;
  logLevel?: 'silent' | 'info' | 'verbose' | 'debug';
  ignoreHttpsErrors?: boolean;
  projectPath?: string;
  template?: string;
}

export function createParserProgram({
  setupProgram,
  parseArgs,
}: {
  setupProgram: () => Command;
  parseArgs?: (options: CliFlags, args: string[]) => CliFlags;
}) {
  return (argv: string[]) => {
    const program = setupProgram();
    program.parse(argv);
    let options = program.opts<CliFlags>();
    options = parseArgs?.(options, program.args ?? []) || options;
    options = warnDeprecatedFlags(options);
    return v.parse(VivliostyleInlineConfig, options);
  };
}

export function setupConfigFromFlags(
  flags: InlineOptions,
): ParsedVivliostyleConfigSchema {
  if (!flags.input) {
    if (flags.enableViewerStartPage) {
      return {
        tasks: [{ entry: [] }],
        inlineOptions: {
          input: { format: 'webbook', entry: EMPTY_DATA_URI },
        },
      };
    } else {
      throw new Error(
        'No input is set. Please set an appropriate entry or a Vivliostyle config file.',
      );
    }
  }
  return {
    tasks: [{ entry: [] }],
    inlineOptions: { ...flags },
  };
}

function warnDeprecatedFlags(options: OptionValues): OptionValues {
  const modifiedOptions = { ...options };

  // Place here warnings for deprecated flags
  // if (options.someDeprecatedFlag) {
  //   Logger.logWarn(
  //     "'--some-deprecated-flag' option was deprecated and will be removed in a future release. Please use '--new-flag' instead.",
  //   );
  // }

  return modifiedOptions;
}

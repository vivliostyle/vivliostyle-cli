import { Command, Option } from 'commander';
import { BuildCliFlags } from '../build.js';
import { validateTimeoutFlag } from '../input/config.js';
import {
  OutputFormat,
  checkOutputFormat,
  detectOutputFormat,
} from '../output/output-types.js';

export function setupBuildParserProgram(): Command {
  // Provide an order-sensitive command parser
  // ex: "-o foo -o bar -f baz"
  //    → [{output: "foo"}, {output:"bar", format: "baz"}]
  // ex: "-f foo -o bar -o baz -f piyo"
  //    → [{output: "bar", format: "foo"}, {output: "baz", format: "piyo"}]
  const targets: {
    output?: string;
    format?: string;
  }[] = [];
  const outputOptionProcessor = (
    value: string,
    previous?: string[],
  ): string[] => {
    if (targets.length === 0 || 'output' in targets[targets.length - 1]) {
      targets.push({ output: value });
    } else {
      targets[targets.length - 1].output = value;
    }
    return [...(previous || []), value];
  };
  const formatOptionProcessor = (
    value: string,
    previous?: string[],
  ): string[] => {
    if (targets.length === 0 || 'format' in targets[targets.length - 1]) {
      targets.push({ format: value });
    } else {
      targets[targets.length - 1].format = value;
    }
    return [...(previous || []), value];
  };

  const program = new Command();
  program
    .name('vivliostyle build')
    .description('build and create PDF file')
    .arguments('[input]')
    .option(
      '-c, --config <config_file>',
      'path to vivliostyle.config.js [vivliostyle.config.js]',
    )
    .option(
      '-o, --output <path>',
      `specify output file name or directory [<title>.pdf]
This option can be specified multiple, then each -o options can be supplied one -f option.
ex: -o output1 -f webpub -o output2.pdf -f pdf`,
      outputOptionProcessor,
    )
    .option(
      '-f, --format <format>',
      `specify output format corresponding output target
If an extension is specified on -o option, this field will be inferenced automatically.`,
      formatOptionProcessor,
    )
    .option(
      '-s, --size <size>',
      `output pdf size
preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
custom(comma separated): 182mm,257mm or 8.5in,11in`,
    )
    .option('-m, --crop-marks', 'print crop marks')
    .option(
      '--bleed <bleed>',
      'extent of the bleed area for printing with crop marks [3mm]',
    )
    .option(
      '--crop-offset <offset>',
      'distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]',
    )
    .option(
      '--css <CSS>',
      'custom style CSS code. (ex: ":root {--my-color: lime;}")',
    )
    .option('--style <stylesheet>', 'additional stylesheet URL or path')
    .option('--user-style <user_stylesheet>', 'user stylesheet URL or path')
    .option('-d, --single-doc', 'single HTML document input')
    .option(
      '-p, --press-ready',
      `make generated PDF compatible with press ready PDF/X-1a [false]
This option is equivalent with "--preflight press-ready"`,
    )
    .option(
      '-t, --timeout <seconds>',
      `timeout limit for waiting Vivliostyle process [120]`,
      validateTimeoutFlag,
    )
    .option('-T, --theme <theme>', 'theme path or package name')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .addOption(
      new Option(
        '--reading-progression <direction>',
        'Direction of reading progression',
      ).choices(['ltr', 'rtl']),
    )
    .addOption(
      new Option(
        '--render-mode <mode>',
        'if docker is set, Vivliostyle try to render PDF on Docker container [local]',
      ).choices(['local', 'docker']),
    )
    .addOption(
      new Option(
        '--preflight <mode>',
        'apply the process to generate PDF for printing',
      ).choices(['press-ready', 'press-ready-local']),
    )
    .option(
      '--preflight-option <options...>',
      `options for preflight process (ex: gray-scale, enforce-outline)
Please refer the document of press-ready for further information.
https://github.com/vibranthq/press-ready`,
    )
    .addOption(new Option('--sandbox', `launch chrome with sandbox`).hideHelp())
    .addOption(
      new Option('--no-sandbox', `launch chrome without sandbox`).hideHelp(),
    )
    .option(
      '--executable-browser <path>',
      'specify a path of executable browser you installed',
    )
    .option('--image <image>', 'specify a docker image to render')
    .option(
      '--http',
      `launch an HTTP server hosting contents instead of file protocol
It is useful that requires CORS such as external web fonts.`,
    )
    .option(
      '--viewer <URL>',
      `specify a URL of displaying viewer instead of vivliostyle-cli's one
It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)`,
    )
    .option(
      '--viewer-param <parameters>',
      `specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")`,
    )
    // Hide --browser option for now. There's no choice other than Chromium.
    //     .addOption(
    //       new commander.Option(
    //         '--browser <browser>',
    //         `Specify a browser type to launch Vivliostyle viewer [chromium]
    // Currently, Firefox and Webkit support preview command only!`,
    //       ).choices(['chromium', 'firefox', 'webkit']),
    //     )
    .addOption(
      new Option(
        '--proxy-server <proxyServer>',
        `HTTP/SOCK proxy server url for underlying Playwright`,
      ),
    )
    .addOption(
      new Option(
        '--proxy-bypass <proxyBypass>',
        `optional comma-separated domains to bypass proxy`,
      ),
    )
    .addOption(
      new Option(
        '--proxy-user <proxyUser>',
        `optional username for HTTP proxy authentication`,
      ),
    )
    .addOption(
      new Option(
        '--proxy-pass <proxyPass>',
        `optional password for HTTP proxy authentication`,
      ),
    )
    .addOption(
      new Option(
        '--log-level <level>',
        'specify a log level of console outputs',
      )
        .choices(['silent', 'info', 'verbose', 'debug'])
        .default('info'),
    )
    .addOption(
      new Option(
        '--ignore-https-errors',
        `true to ignore HTTPS errors when Playwright browser opens a new page`,
      ),
    )
    .addOption(new Option('--bypassed-pdf-builder-option <json>').hideHelp())
    // TODO: Remove it in the next major version up
    .addOption(new Option('--executable-chromium <path>').hideHelp())
    .addOption(new Option('--verbose').hideHelp())
    .action((_arg: any, option: BuildCliFlags) => {
      option.targets = inferenceTargetsOption(targets);
    });

  return program;
}

export function inferenceTargetsOption(
  parsed: {
    output?: string;
    format?: string;
  }[],
): Pick<OutputFormat, 'path' | 'format'>[] {
  return parsed.map(({ output, format }) => {
    if (!output) {
      // -f is an optional option but -o is required one
      throw new Error(
        `Couldn't find the output option corresponding --format ${format} option. Please check the command options.`,
      );
    }
    const detectedFormat = format ?? detectOutputFormat(output);
    if (!checkOutputFormat(detectedFormat)) {
      throw new Error(`Unknown format: ${format}`);
    }
    return { path: output, format: detectedFormat };
  });
}

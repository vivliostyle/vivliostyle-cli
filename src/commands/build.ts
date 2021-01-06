import chalk from 'chalk';
import program from 'commander';
import process from 'process';
import terminalLink from 'terminal-link';
import path from 'upath';
import { buildArtifacts, cleanup } from '../builder';
import {
  CliFlags,
  collectVivliostyleConfig,
  getVivliostyleConfigPath,
  mergeConfig,
  validateTimeoutFlag,
} from '../config';
import { buildPDF } from '../pdf';
import { gracefulError, log, startLogging, stopLogging } from '../util';

export interface BuildCliFlags extends CliFlags {}

// Provide an order-sensitive command parser
// ex: "-o foo -o bar -f baz"
//    → [{output: "foo"}, {output:"bar", format: "baz"}]
// ex: "-f foo -o bar -o baz -f piyo"
//    → [{output: "bar", format: "foo"}, {output: "baz", format: "piyo"}]
type TargetRecord = { output: string; format: string };
const targets: Partial<TargetRecord>[] = [];
const outputOptionProcessor = (
  value: string,
  _previous: typeof targets,
): typeof targets => {
  if (targets.length === 0 || 'output' in targets[targets.length - 1]) {
    targets.push({ output: value });
  } else {
    targets[targets.length - 1].output = value;
  }
  return targets;
};
const formatOptionProcessor = (
  value: string,
  _previous: typeof targets,
): typeof targets => {
  if (targets.length === 0 || 'format' in targets[targets.length - 1]) {
    targets.push({ format: value });
  } else {
    targets[targets.length - 1].format = value;
  }
  return targets;
};

program
  .name('vivliostyle build')
  .description('build and create PDF file')
  .arguments('<input>')
  .option(
    '-c, --config <config_file>',
    'path to vivliostyle.config.js [vivliostyle.config.js]',
  )
  .option(
    '-o, --output <path>',
    `specify output file name or directory [<title>.pdf]
This option can be specified multiple, then each -o options can be supplied one -f option.
ex: -o output1 -f webbook -o output2.pdf -f pdf`,
    outputOptionProcessor,
  )
  .option(
    '-f, --format <format>',
    `specify output format corresponding output target
If an extension is specified on -o option, this field will be inferenced automatically.`,
    formatOptionProcessor,
  )
  .option('-t, --theme <theme>', 'theme path or package name')
  .option(
    '-s, --size <size>',
    `output pdf size [Letter]
preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
custom(comma separated): 182mm,257mm or 8.5in,11in`,
  )
  .option(
    '-p, --press-ready',
    `make generated PDF compatible with press ready PDF/X-1a [false]`,
  )
  .option('--title <title>', 'title')
  .option('--author <author>', 'author')
  .option('--language <language>', 'language')
  .option('--verbose', 'verbose log output')
  .option(
    '--timeout <seconds>',
    `timeout limit for waiting Vivliostyle process [60s]`,
    validateTimeoutFlag,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox. use this option when ECONNREFUSED error occurred.`,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome (or Chromium) you installed',
  )
  .parse(process.argv);

try {
  if (!program.output) {
    gracefulError(new Error('Please specify output option(s).'));
  }
  const targets = inferenceTargetsOption(program.output);

  build({
    input: program.args?.[0],
    configPath: program.config,
    targets,
    outDir: program.outDir,
    outFile: program.outFile,
    theme: program.theme,
    size: program.size,
    title: program.title,
    author: program.author,
    language: program.language,
    pressReady: program.pressReady,
    verbose: program.verbose,
    distDir: program.distDir,
    timeout: program.timeout,
    sandbox: program.sandbox,
    executableChromium: program.executableChromium,
  }).catch(gracefulError);
} catch (err) {
  gracefulError(err);
}

export default async function build(cliFlags: BuildCliFlags) {
  startLogging('Collecting build config');

  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  cleanup(config.distDir);
  const { manifestPath } = await buildArtifacts(config);

  // generate PDF
  const output = await buildPDF({
    ...config,
    input: manifestPath,
  });

  stopLogging('Built successfully.', '🎉');

  const formattedOutput = chalk.bold.green(
    path.relative(process.cwd(), output),
  );
  log(
    `\n${terminalLink(formattedOutput, 'file://' + output, {
      fallback: () => formattedOutput,
    })} has been created.`,
  );

  // TODO: gracefully exit broker & source server
  process.exit(0);
}

function inferenceTargetsOption(parsed: typeof targets): TargetRecord[] {
  return parsed.map(
    ({ output, format }): TargetRecord => {
      if (!output) {
        // -f is an optional option but -o is required one
        throw new Error(
          `Cannot found output option corresponding --format ${format} option. Please check the command options.`,
        );
      }
      if (!format) {
        const ext = path.extname(output);
        switch (ext) {
          case '.pdf':
            format = 'pdf';
            break;
          case '.json':
            format = 'pub-manifest';
            break;
          default:
            format = 'webbook';
            break;
        }
      } else if (!['pdf', 'pub-manifest', 'webbook'].includes(format)) {
        throw new Error(`Unknown format: ${format}`);
      }
      return { output, format };
    },
  );
}

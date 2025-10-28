import debug from 'debug';
import { Console } from 'node:console';
import type { Readable, Writable } from 'node:stream';
import type { WriteStream } from 'node:tty';
import yoctoSpinner, { Spinner } from 'yocto-spinner';
import { blueBright, greenBright, redBright, yellowBright } from 'yoctocolors';
import { isInContainer, registerExitHandler } from './util.js';

export const isUnicodeSupported =
  process.platform !== 'win32' || Boolean(process.env.WT_SESSION);

export const randomBookSymbol = ['📕', '📗', '📘', '📙'][
  Math.floor(Math.random() * 4)
];

export const spinnerFrames = isUnicodeSupported
  ? ['▁▁╱ ', '▁║▁ ', '╲▁▁ ', '▁▁▁ ', '▁▁▁ ', '▁▁▁ ']
  : ['-   ', '\\   ', '|   ', '/   '];

export const spinnerInterval = 80;

const infoSymbol = blueBright('INFO');
const successSymbol = greenBright('SUCCESS');
const warnSymbol = yellowBright('WARN');
const errorSymbol = redBright('ERROR');

export interface LoggerInterface {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class Logger {
  /**
   * 0: silent 1: info 2: verbose 3: debug
   */
  static #logLevel: 0 | 1 | 2 | 3 = 0;
  static #loggerInstance: Logger | undefined;
  static #nonBlockingLogPrinted = false;
  static #customLogger: LoggerInterface | undefined;
  static #logPrefix: string | undefined;
  static #stdin: Readable = process.stdin;
  static #stdout: Writable = process.stdout;
  static #stderr: Writable = process.stderr;
  static #signal: AbortSignal | undefined;

  static debug = debug('vs-cli');

  static get #console() {
    if (this.#customLogger) {
      return {
        ...this.#customLogger,
        log: () => {
          /* NOOP */
        },
      };
    }
    return new Console({
      stdout: this.#stdout,
      stderr: this.#stderr,
    });
  }

  static get #spinner() {
    return this.#loggerInstance && this.#loggerInstance.#_spinner;
  }

  static get stdin() {
    return this.#stdin;
  }

  static get stdout() {
    return this.#stdout;
  }

  static get stderr() {
    return this.#stderr;
  }

  static get signal() {
    return this.#signal;
  }

  static get isInteractive() {
    return Boolean(
      !this.#customLogger &&
        (this.#stderr as WriteStream).isTTY &&
        process.env.TERM !== 'dumb' &&
        !('CI' in process.env) &&
        !import.meta.env?.VITEST &&
        !debug.enabled('vs-cli') &&
        // Prevent stream output in docker container so that not to spawn process
        !isInContainer(),
    );
  }

  static startLogging(text: string) {
    if (this.#logLevel === 0) {
      return;
    }
    if (!this.isInteractive) {
      this.logInfo(text);
      return;
    }
    if (this.#loggerInstance) {
      this.#loggerInstance.#_spinner.text = text;
      return this.#loggerInstance;
    }
    this.#loggerInstance = new Logger(this.#stderr);
    this.#loggerInstance.#start(text);
    return this.#loggerInstance;
  }

  static suspendLogging(text: string) {
    if (this.#logLevel === 0) {
      return;
    }
    if (!this.#spinner || !this.isInteractive) {
      this.logInfo(text);
      return;
    }
    const currentMsg = this.#spinner?.text;
    this.logUpdate(currentMsg);
    this.#spinner.stop(`${infoSymbol} ${text}\n`);
    return {
      [Symbol.dispose]() {
        if (Logger.isInteractive) {
          Logger.#console.log('');
          Logger.#spinner?.start(currentMsg);
          Logger.#nonBlockingLogPrinted = true;
        }
      },
    };
  }

  static log(...messages: any[]) {
    if (this.#logLevel < 1) {
      return;
    }
    Logger.#console.log(...messages);
  }

  static logUpdate(...messages: any[]) {
    if (!this.#spinner || !this.isInteractive) {
      this.logInfo(...messages);
      return;
    }
    this.#spinner.stop(
      this.#nonBlockingLogPrinted
        ? undefined
        : `${infoSymbol} ${this.#spinner.text}`,
    );
    this.#spinner.start(messages.join(' '));
    this.#nonBlockingLogPrinted = false;
  }

  static getMessage(message: string, symbol?: string) {
    return !this.#customLogger && symbol ? `${symbol} ${message}` : message;
  }

  static #nonBlockingLog(
    logMethod: 'warn' | 'error' | 'info',
    message: string,
  ) {
    if (!this.#spinner || !this.isInteractive) {
      if (this.#logPrefix) {
        message = `${this.#logPrefix} ${message}`;
      }
      this.#logLevel >= 3
        ? this.debug(message)
        : this.#console[logMethod](message);
      return;
    }
    this.logUpdate(this.#spinner.text);
    this.#nonBlockingLogPrinted = true;
    this.#spinner.stop(message);
    this.#spinner.start();
  }

  static logSuccess(...messages: any[]) {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'info',
      this.getMessage(messages.join(' '), successSymbol),
    );
  }

  static logError(...messages: any[]) {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'error',
      this.getMessage(messages.join(' '), errorSymbol),
    );
  }

  static logWarn(...messages: any[]) {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'warn',
      this.getMessage(messages.join(' '), warnSymbol),
    );
  }

  static logInfo(...messages: any[]) {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'info',
      this.getMessage(messages.join(' '), infoSymbol),
    );
  }

  static logVerbose(...messages: any[]) {
    if (this.#logLevel < 2) {
      return;
    }
    this.#nonBlockingLog('info', this.getMessage(messages.join(' ')));
  }

  static setLogOptions({
    logLevel,
    logger,
    stdin,
    stdout,
    stderr,
    signal,
  }: {
    logLevel?: 'silent' | 'info' | 'verbose' | 'debug';
    logger?: LoggerInterface;
    stdin?: Readable;
    stdout?: Writable;
    stderr?: Writable;
    signal?: AbortSignal;
  }) {
    if (logLevel) {
      this.#logLevel = (
        {
          silent: 0,
          info: 1,
          verbose: 2,
          debug: 3,
        } as const
      )[logLevel];
      if (this.#logLevel >= 3) {
        debug.enable('vs-cli');
      }
    }
    if (logger) {
      this.#customLogger = logger;
    }
    if (stdin) {
      this.#stdin = stdin;
    }
    if (stdout) {
      this.#stdout = stdout;
    }
    if (stderr) {
      this.#stderr = stderr;
    }
    if (signal) {
      this.#signal = signal;
    }
  }

  static setLogPrefix(prefix: string) {
    this.#logPrefix = prefix;
  }

  #_spinner: Spinner;
  #_disposeSpinnerExitHandler: (() => void) | undefined;

  constructor(stream: Writable) {
    this.#_spinner = yoctoSpinner({
      spinner: {
        frames: spinnerFrames,
        interval: spinnerInterval,
      },
      color: 'gray',
      stream,
    });
    return this;
  }

  #start(text: string) {
    this.#_spinner.start(text);
    this.#_disposeSpinnerExitHandler = registerExitHandler(
      'Stopping spinner',
      () => {
        this.#_spinner.stop();
      },
    );
  }

  [Symbol.dispose]() {
    this.#_disposeSpinnerExitHandler?.();
    this.#_spinner.stop(
      Logger.#nonBlockingLogPrinted
        ? undefined
        : `${infoSymbol} ${this.#_spinner.text}`,
    );
    Logger.#loggerInstance = undefined;
  }
}

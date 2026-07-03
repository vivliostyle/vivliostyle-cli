import { Console } from 'node:console';
import type { Readable, Writable } from 'node:stream';
import type { WriteStream } from 'node:tty';

import debug from 'debug';
import yoctoSpinner, { type Spinner } from 'yocto-spinner';
import { blueBright, greenBright, redBright, yellowBright } from 'yoctocolors';

import { registerCleanupHandler } from './util.js';

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
  /**
   * True in the forked build subprocess (renderMode: docker),
   * which logs non-interactively.
   */
  static #containerForkMode = false;

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
    return this.#loggerInstance && this.#loggerInstance.#spinnerInstance;
  }

  static get stdin(): Readable {
    return this.#stdin;
  }

  static get stdout(): Writable {
    return this.#stdout;
  }

  static get stderr(): Writable {
    return this.#stderr;
  }

  static get signal(): AbortSignal | undefined {
    return this.#signal;
  }

  static get isInteractive(): boolean {
    return (
      !this.#customLogger &&
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- #stderr is typed Writable; read the tty-only isTTY flag
      (this.#stderr as WriteStream).isTTY &&
      process.env.TERM !== 'dumb' &&
      !('CI' in process.env) &&
      !import.meta.env?.VITEST &&
      !debug.enabled('vs-cli') &&
      !this.#containerForkMode
    );
  }

  static startLogging(text: string): Logger | undefined {
    if (this.#logLevel === 0) {
      return;
    }
    if (!this.isInteractive) {
      this.logInfo(text);
      return;
    }
    if (this.#loggerInstance) {
      this.#loggerInstance.#spinnerInstance.text = text;
      return this.#loggerInstance;
    }
    this.#loggerInstance = new Logger(this.#stderr);
    this.#loggerInstance.#start(text);
    return this.#loggerInstance;
  }

  static suspendLogging(text: string): Disposable | undefined {
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
      [Symbol.dispose](): void {
        if (Logger.isInteractive) {
          Logger.#console.log('');
          Logger.#spinner?.start(currentMsg);
          Logger.#nonBlockingLogPrinted = true;
        }
      },
    };
  }

  static log(...messages: unknown[]): void {
    if (this.#logLevel < 1) {
      return;
    }
    Logger.#console.log(...messages);
  }

  static logUpdate(...messages: unknown[]): void {
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

  /**
   * Update the text of the running spinner in place without printing a
   * checkpoint line. Unlike `logUpdate`, this method does nothing when the
   * output is not interactive, so it is safe to call at a high frequency.
   */
  static logUpdateProgress(...messages: unknown[]): void {
    if (this.#logLevel < 1 || !this.#spinner || !this.isInteractive) {
      return;
    }
    this.#spinner.text = messages.join(' ');
    this.#nonBlockingLogPrinted = true;
  }

  static getMessage(message: string, symbol?: string): string {
    return !this.#customLogger && symbol ? `${symbol} ${message}` : message;
  }

  static #nonBlockingLog(
    logMethod: 'warn' | 'error' | 'info',
    message: string,
  ) {
    if (!this.#spinner || !this.isInteractive) {
      const line = this.#logPrefix ? `${this.#logPrefix} ${message}` : message;
      if (this.#logLevel >= 3) {
        this.debug(line);
      } else {
        this.#console[logMethod](line);
      }
      return;
    }
    this.logUpdate(this.#spinner.text);
    this.#nonBlockingLogPrinted = true;
    this.#spinner.stop(message);
    this.#spinner.start();
  }

  static logSuccess(...messages: unknown[]): void {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'info',
      this.getMessage(messages.join(' '), successSymbol),
    );
  }

  static logError(...messages: unknown[]): void {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'error',
      this.getMessage(messages.join(' '), errorSymbol),
    );
  }

  static logWarn(...messages: unknown[]): void {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'warn',
      this.getMessage(messages.join(' '), warnSymbol),
    );
  }

  static logInfo(...messages: unknown[]): void {
    if (this.#logLevel < 1) {
      return;
    }
    this.#nonBlockingLog(
      'info',
      this.getMessage(messages.join(' '), infoSymbol),
    );
  }

  static logVerbose(...messages: unknown[]): void {
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
    containerForkMode,
  }: {
    logLevel?: 'silent' | 'info' | 'verbose' | 'debug';
    logger?: LoggerInterface;
    stdin?: Readable;
    stdout?: Writable;
    stderr?: Writable;
    signal?: AbortSignal;
    containerForkMode?: boolean;
  }): void {
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
    if (containerForkMode !== undefined) {
      this.#containerForkMode = containerForkMode;
    }
  }

  static setLogPrefix(prefix: string): void {
    this.#logPrefix = prefix;
  }

  #spinnerInstance: Spinner;
  #disposeSpinnerCleanupHandler: (() => void) | undefined;

  constructor(stream: Writable) {
    this.#spinnerInstance = yoctoSpinner({
      handleSignals: false,
      spinner: {
        frames: spinnerFrames,
        interval: spinnerInterval,
      },
      color: 'gray',
      stream,
    });
  }

  #start(text: string) {
    this.#spinnerInstance.start(text);
    this.#disposeSpinnerCleanupHandler = registerCleanupHandler(
      'Stopping spinner',
      () => {
        this.#spinnerInstance.stop();
      },
    );
  }

  [Symbol.dispose](): void {
    this.#disposeSpinnerCleanupHandler?.();
    this.#spinnerInstance.stop(
      Logger.#nonBlockingLogPrinted
        ? undefined
        : `${infoSymbol} ${this.#spinnerInstance.text}`,
    );
    Logger.#loggerInstance = undefined;
  }
}

// Type file providing better-ajv-errors package seems not to be loaded
// because newer TypeScript doesn't look "types" settings in `type: module` context.
declare module 'better-ajv-errors' {
  import type { ErrorObject } from 'ajv';

  export interface IOutputError {
    start: { line: number; column: number; offset: number };
    // Optional for required
    end?: { line: number; column: number; offset: number };
    error: string;
    suggestion?: string;
  }

  export interface IInputOptions {
    format?: 'cli' | 'js';
    indent?: number | null;

    /** Raw JSON used when highlighting error location */
    json?: string | null;
  }

  export default function <S, T, Options extends IInputOptions>(
    schema: S,
    data: T,
    errors: Array<ErrorObject>,
    options?: Options,
  ): Options extends { format: 'js' } ? Array<IOutputError> : string;
}

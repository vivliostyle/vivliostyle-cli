declare module '@vivliostyle/jsdom' {
  export * from 'jsdom';

  export interface AbortablePromise<T> extends Promise<T> {
    abort(): void;
    response?: import('http').IncomingMessage;
  }

  export class ResourceLoader {
    _readFile(filePath: string): AbortablePromise<Buffer>;
    fetch(url: string, options?: FetchOptions): AbortablePromise<Buffer> | null;
    constructor(obj?: ResourceLoaderConstructorOptions);
  }
}

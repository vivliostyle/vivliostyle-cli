declare module 'jsdom' {
  export class ResourceLoader {
    _readFile(filePath: string): AbortablePromise<Buffer>;
    fetch(url: string, options?: FetchOptions): AbortablePromise<Buffer> | null;
    constructor(obj?: ResourceLoaderConstructorOptions);
  }
}

// List the libraries that are assumed to run in the Node.js environment
// but are not required to run the Vivliostyle CLI.
// Mark these modules as dynamic imports to prevent execution failure
// when trying to import unnecessary modules in a standalone environment.
export const nodeExternalModules = [
  '@napi-rs/canvas',
  '@puppeteer/browsers',
  'command-exists',
  'mupdf',
  'press-ready',
  'pdf-lib',
  'puppeteer-core',
] as const;

// The namespace object that dynamic import() returns for a CommonJS
// module; `typeof import(...)` alone yields what require() returns.
type CjsNamespace<M> = { default: M } & Pick<M, keyof M>;

export type NodeExternalModules = {
  '@napi-rs/canvas': CjsNamespace<typeof import('@napi-rs/canvas')>;
  '@puppeteer/browsers': typeof import('@puppeteer/browsers');
  'command-exists': CjsNamespace<typeof import('command-exists')>;
  mupdf: typeof import('mupdf');
  'press-ready': CjsNamespace<typeof import('press-ready')>;
  'pdf-lib': CjsNamespace<typeof import('pdf-lib')>;
  'puppeteer-core': typeof import('puppeteer-core');
};

export const importNodeModule = <
  T extends (typeof nodeExternalModules)[number],
>(
  name: T,
): Promise<NodeExternalModules[T]> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- map the dynamic import to its registered module type
  import(name) as Promise<NodeExternalModules[T]>;

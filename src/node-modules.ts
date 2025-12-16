// List the libraries that are assumed to run in the Node.js environment
// but are not required to run the Vivliostyle CLI.
// Mark these modules as dynamic imports to prevent execution failure
// when trying to import unnecessary modules in a standalone environment.
export const nodeExternalModules = [
  '@napi-rs/canvas',
  '@puppeteer/browsers',
  'command-exists',
  'press-ready',
  'pdf-lib',
  'puppeteer-core',
] as const;

type NodeExternalModules = {
  '@napi-rs/canvas': typeof import('@napi-rs/canvas');
  '@puppeteer/browsers': typeof import('@puppeteer/browsers');
  'command-exists': typeof import('command-exists');
  'press-ready': typeof import('press-ready');
  'pdf-lib': typeof import('pdf-lib');
  'puppeteer-core': typeof import('puppeteer-core');
};

export const importNodeModule = <
  T extends (typeof nodeExternalModules)[number],
>(
  name: T,
) => import(name) as Promise<NodeExternalModules[T]>;

// List the libraries that are assumed to run in the Node.js environment
// but are not required to run the Vivliostyle CLI.
// Mark these modules as dynamic imports to prevent execution failure
// when trying to import unnecessary modules in a standalone environment.
export const nodeExternalModules = [
  '@napi-rs/canvas',
  'command-exists',
  'execa',
  'press-ready',
  'pdf-lib',
  'playwright-core',
  'playwright-core/lib/server',
] as const;

type NodeExternalModules = {
  '@napi-rs/canvas': typeof import('@napi-rs/canvas');
  'command-exists': typeof import('command-exists');
  execa: typeof import('execa');
  'press-ready': typeof import('press-ready');
  'pdf-lib': typeof import('pdf-lib');
  'playwright-core': typeof import('playwright-core');
  'playwright-core/lib/server': typeof import('playwright-core/lib/server');
};

export const importNodeModule = <
  T extends (typeof nodeExternalModules)[number],
>(
  name: T,
) => import(name) as Promise<NodeExternalModules[T]>;

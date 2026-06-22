/* oxlint-disable no-underscore-dangle -- patches Node's internal Module._load */
declare module 'module' {
  let _load_stubs: any;
  let _load_original: any;
  let _load: any;
}

// Mock modules loaded by require() statements
// https://github.com/vitest-dev/vitest/discussions/3134
export async function mockRequire(
  mockedUri: string,
  stub: unknown,
): Promise<void> {
  const { Module } = await import('node:module');

  Module._load_original ||= Module._load;
  Module._load_stubs ||= {};
  Module._load_stubs[mockedUri] = stub;
  Module._load = (uri: string, parent: unknown) => {
    if (uri in Module._load_stubs) {
      return Module._load_stubs[uri];
    }
    return Module._load_original(uri, parent);
  };
}

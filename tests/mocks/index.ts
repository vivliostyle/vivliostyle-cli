declare module 'module' {
  let _load_stubs: any;
  let _load_original: any;
  let _load: any;
}

// Mock modules loaded by require() statements
// https://github.com/vitest-dev/vitest/discussions/3134
export async function mockRequire(mockedUri, stub) {
  const { Module } = await import('module');

  Module._load_original ||= Module._load;
  Module._load_stubs ||= {};
  Module._load_stubs[mockedUri] = stub;
  Module._load = (uri, parent) => {
    if (uri in Module._load_stubs) {
      return Module._load_stubs[uri];
    }
    return Module._load_original(uri, parent);
  };
}

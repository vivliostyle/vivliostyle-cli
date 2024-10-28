declare module 'module' {
  let _load_original: any;
  let _load: any;
}

// Mock modules loaded by require() statements
// https://github.com/vitest-dev/vitest/discussions/3134
export async function mock(mockedUri, stub) {
  const { Module } = await import('module');

  Module._load_original = Module._load;
  Module._load = (uri, parent) => {
    if (uri === mockedUri) return stub;
    return Module._load_original(uri, parent);
  };
}

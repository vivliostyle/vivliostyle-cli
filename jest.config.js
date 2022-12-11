/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testMatch: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
  testPathIgnorePatterns: ['/dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  coverageProvider: 'v8',
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/', '/tmp/'],
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: './tests/fixtures/node.js',
  testMatch: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
  testPathIgnorePatterns: ['/dist/'],
};

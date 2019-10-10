module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/*.+(ts|tsx|js)', '**/tests/*.test.(ts|tsx|js)'],
  testPathIgnorePatterns: ['/dist/'],
};

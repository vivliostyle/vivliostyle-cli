module.exports = {
  entry: 'manuscript/soda.md',
  theme: { specifier: '../themes/debug-theme', import: 'not-exist.css' },
  workspaceDir: '.vs-nonExistImport',
};

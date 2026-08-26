module.exports = {
  postcssPlugin: 'fixture-plugin',
  Declaration: {
    color: (decl) => {
      decl.value = 'blue';
    },
  },
};

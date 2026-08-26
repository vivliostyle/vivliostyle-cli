import tailwindcss from '@tailwindcss/postcss';

// Vivliostyle Core (as of 2.45) drops a whole rule when its selector list
// contains a selector it cannot parse, such as `:host` or
// `::file-selector-button` that Tailwind CSS emits. Remove those selectors so
// that the rest of the list (e.g. the `:root` theme variables) stays effective.
const unsupportedSelector = /:host|::backdrop|::file-selector-button/;
const stripUnsupportedSelectors = {
  postcssPlugin: 'strip-unsupported-selectors',
  OnceExit(root) {
    root.walkRules(unsupportedSelector, (rule) => {
      const selectors = rule.selectors.filter(
        (s) => !unsupportedSelector.test(s),
      );
      if (selectors.length > 0) {
        rule.selectors = selectors;
      } else {
        rule.remove();
      }
    });
  },
};

export default {
  plugins: [tailwindcss(), stripUnsupportedSelectors],
};

# Frontend Framework Support

Vivliostyle CLI creates publications using web technologies. By combining it with other web frontend frameworks, you can leverage powerful features. For example, you can export the same manuscript as both a web page and a publication.

## Referencing Statically Built HTML Files

If your framework has a static site build feature, you can reference the built HTML files using the `static` option in Vivliostyle CLI. This allows you to load those files as entries.

For example, consider a case where HTML files are built in the `dist` directory. This directory contains `index.html` and, within the `blog` directory, `my-first-post.html` and `another-post.html`. To create a publication from these three HTML files, configure it as follows:

```js
{
  static: {
    '/': 'dist',
  },
  entry: [
    '/index.html',
    '/blog/my-first-post.html',
    '/blog/another-post.html',
  ],
};
```

> ![IMPORTANT]
> Entries hosted with `static` must be referenced using absolute paths (paths starting with `/`). Otherwise, the HTML files will be loaded relative to `vivliostyle.config.js` instead of the directory specified in `static`.

> ![NOTE]
> While it is also possible to specify HTML files directly in `entry` using relative paths, using the `static` option is more convenient. For example, directly specifying files does not allow external files (such as images) referenced by the HTML to be loaded, but using the `static` option ensures that all files under the directory are referenced and displayed correctly.

## Using Frameworks Based on Vite

Vivliostyle CLI is developed based on Vite, a web frontend development tool. Therefore, it can be used in combination with frameworks based on Vite.

Vivliostyle CLI provides the following two usage methods depending on the type of framework.

### 1. Using Vite Plugins

Vivliostyle CLI allows you to use Vite or Rollup plugins. You can configure plugins and Vite settings in the `vite` option.

```js
{
  vite: {
    plugins: [...],
  },
}
```

Vivliostyle Viewer differs from typical web applications in that it has restrictions on JavaScript execution. Please note the following points:

- Vivliostyle Viewer does not support client-side routing technologies (Single Page Applications; SPA), so each page must be statically rendered. If the environment does not work with `appType` set to `mpa`, this method cannot be used.

- Vivliostyle Viewer cannot detect changes to HTML content on the client side. Therefore, the UI framework used must support server-side rendering (SSR). If client-side JavaScript is included, it may not function correctly.

### 2. Using Vivliostyle CLI as a Vite Plugin

- [Example: with-astro](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/with-astro)

Some frameworks (e.g., [Astro](https://astro.build/)) can accept external Vite plugins but cannot be used as Vite plugins themselves. In such cases, Vivliostyle CLI is used as a Vite plugin.

For example, in Astro, you can pass the Vite plugin of Vivliostyle CLI to the `vite.plugins` option in `astro.config.js` to use Astro and Vivliostyle CLI simultaneously. In the example below, the `openViewer: true` option is specified to automatically open the Vivliostyle Viewer when the Astro dev server starts.

```js
import { createVitePlugin } from '@vivliostyle/cli';
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    plugins: [
      createVitePlugin({
        openViewer: true,
      }),
    ],
  },
});
```

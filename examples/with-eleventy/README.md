# Vivliostyle CLI with Eleventy (11ty)

## Writing Phase

Run the following command to start the Eleventy dev server:

```sh
npm run start
```

After the server starts, access http://localhost:8080/\_\_vivliostyle-viewer/index.html#src=/vivliostyle/publication.json to open the Vivliostyle Viewer.

## Build Phase

To allow Vivliostyle CLI to reference the HTML files built by Eleventy, first execute the Eleventy build, then run the Vivliostyle CLI build.

```sh
npm run eleventy
npm run vivliostyle build
```

You can execute both builds with the following command:

```sh
npm run build
```

## Structure of example project

This project is based on [eleventy-base-blog](https://github.com/11ty/eleventy-base-blog). To enable the Vivliostyle Viewer to work, the following changes have been made to the original project:

- [eleventy-plugin-vite](https://github.com/11ty/eleventy-plugin-vite) is used to add the Vivliostyle CLI's Vite plugin. The `eleventy.config.js` is configured as follows:

```js
import pluginVite from '@11ty/eleventy-plugin-vite';
import { createVitePlugin } from '@vivliostyle/cli';

eleventyConfig.addPlugin(pluginVite, {
  viteOptions: {
    plugins: [createVitePlugin()],
  },
});
```

- [`content/raw-pages.njk`](content/raw-pages.njk) has been added. This page displays blog posts without styles, stripped from the default page template, and is used as the source data for Vivliostyle CLI. For example, accessing http://localhost:8080/raw/firstpost/ will show a blog post without styles.

## References

- Eleventy: https://www.11ty.dev/
- eleventy-base-blog: https://github.com/11ty/eleventy-base-blog
- eleventy-plugin-vite: https://github.com/11ty/eleventy-plugin-vite

# Vivliostyle CLI with Astro

## Writing Phase

By running the following command, the Astro dev server and Vivliostyle Viewer will start simultaneously.

```sh
npm run dev
```

You can also start the Astro dev server without Vivliostyle Viewer.

```sh
npm run astro dev
```

## Build Phase

To allow Vivliostyle CLI to reference the HTML files built by Astro, first execute the Astro build, then run the Vivliostyle CLI build.

```sh
npm run astro build
npm run vivliostyle build
```

You can execute both builds with the following command:

```sh
npm run build
```

## Structure of example project

This project is based on the [Astro Starter Kit: Blog](https://astro.new/blog?on=github). To enable Vivliostyle Viewer, the following changes have been made to the original project:

- The Vivliostyle CLI Vite plugin has been added to the Astro configuration. The `astro.config.js` is configured as follows:

```js
import { createVitePlugin } from '@vivliostyle/cli';

export default defineConfig({
  vite: {
    plugins: [
      createVitePlugin({
        openViewer: !!process.env.OPEN_VIVLIOSTYLE_VIEWER,
      }),
    ],
  },
});
```

- [`src/pages/raw/[...slug].astro`](src/pages/raw/[...slug].astro) has been added. This page displays blog posts without styles, stripped from the default page template, and is used as the source data for Vivliostyle CLI. For example, accessing http://localhost:4321/raw/markdown-style-guide/ will show a blog post without styles.

## References

- Astro: https://astro.build/
- Astro Starter Kit: Blog: https://astro.new/blog?on=github

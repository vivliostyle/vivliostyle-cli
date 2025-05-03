// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { createVitePlugin } from '@vivliostyle/cli';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [
      createVitePlugin({
        openViewer: !!process.env.OPEN_VIVLIOSTYLE_VIEWER,
      }),
    ],
  },
});

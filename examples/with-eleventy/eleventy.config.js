import {
  HtmlBasePlugin,
  IdAttributePlugin,
  InputPathToUrlTransformPlugin,
} from '@11ty/eleventy';
import { eleventyImageTransformPlugin } from '@11ty/eleventy-img';
import pluginNavigation from '@11ty/eleventy-navigation';
import { feedPlugin } from '@11ty/eleventy-plugin-rss';
import pluginSyntaxHighlight from '@11ty/eleventy-plugin-syntaxhighlight';
import pluginVite from '@11ty/eleventy-plugin-vite';
import { createVitePlugin } from '@vivliostyle/cli';
import pluginFilters from './_config/filters.js';

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function (eleventyConfig) {
  eleventyConfig.addPreprocessor('drafts', '*', (data, content) => {
    if (data.draft && process.env.ELEVENTY_RUN_MODE === 'build') {
      return false;
    }
  });

  eleventyConfig
    .addPassthroughCopy({
      './public/': '/',
    })
    .addPassthroughCopy('./content/feed/pretty-atom-feed.xsl');

  eleventyConfig.addWatchTarget('content/**/*.{svg,webp,png,jpg,jpeg,gif}');

  eleventyConfig.addBundle('css', {
    toFileDirectory: 'dist',
  });
  eleventyConfig.addBundle('js', {
    toFileDirectory: 'dist',
  });

  eleventyConfig.addPlugin(pluginSyntaxHighlight, {
    preAttributes: { tabindex: 0 },
  });
  eleventyConfig.addPlugin(pluginNavigation);
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

  eleventyConfig.addPlugin(feedPlugin, {
    type: 'atom', // or "rss", "json"
    outputPath: '/feed/feed.xml',
    stylesheet: 'pretty-atom-feed.xsl',
    templateData: {
      eleventyNavigation: {
        key: 'Feed',
        order: 4,
      },
    },
    collection: {
      name: 'posts',
      limit: 10,
    },
    metadata: {
      language: 'en',
      title: 'Blog Title',
      subtitle: 'This is a longer description about your blog.',
      base: 'https://example.com/',
      author: {
        name: 'Your Name',
      },
    },
  });

  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ['avif', 'webp', 'auto'],
    failOnError: false,
    htmlOptions: {
      imgAttributes: {
        loading: 'lazy',
        decoding: 'async',
      },
    },
    sharpOptions: {
      animated: true,
    },
  });

  eleventyConfig.addPlugin(pluginFilters);

  eleventyConfig.addPlugin(IdAttributePlugin);

  eleventyConfig.addShortcode('currentBuildDate', () => {
    return new Date().toISOString();
  });

  eleventyConfig.addPlugin(pluginVite, {
    viteOptions: {
      plugins: [
        createVitePlugin({
          // openViewer: true is not working for eleventy-plugin-vite
          // You can open the viewer manually after the dev server starts
          // http://localhost:8080/__vivliostyle-viewer/index.html#src=/vivliostyle/publication.json
        }),
      ],
    },
  });
}

export const config = {
  templateFormats: ['md', 'njk', 'html', 'liquid', '11ty.js'],
  markdownTemplateEngine: 'njk',
  htmlTemplateEngine: 'njk',
  dir: {
    input: 'content',
    includes: '../_includes',
    data: '../_data',
    output: '_site',
  },
};

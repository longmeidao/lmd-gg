import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkGemoji from 'remark-gemoji';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import codeImport from 'remark-code-import';
import remarkBlockContainers from 'remark-block-containers';
import astroExpressiveCode from 'astro-expressive-code';
import rehypeFigure from 'rehype-figure';

import { remarkModifiedTime } from './plugins/remark-modified-time';
import { remarkReadingTime } from './plugins/remark-reading-time';
import slateConfig from './slate.config';

function generateAstroConfigure() {
  const remarkPlugins = [
    remarkGemoji,
    remarkMath,
    codeImport,
    remarkBlockContainers,
  ];

  if (slateConfig.lastModified) {
    remarkPlugins.push(remarkModifiedTime);
  }

  if (slateConfig.readTime) {
    remarkPlugins.push(remarkReadingTime);
  }

  const astroConfig = {
    site: slateConfig.site,
    integrations: [
      astroExpressiveCode(),
      mdx(),
      react(),
      sitemap({
        ...slateConfig.sitemap,
        filter: (page) => !page.includes('/admin'),
      }),
    ],
    compressHTML: true,
    markdown: {
      processor: unified({
        remarkPlugins,
        rehypePlugins: [rehypeKatex, rehypeFigure],
      }),
    },
    vite: {
      plugins: [svgr(), tailwindcss()],
    },
  };

  return astroConfig;
}

// https://astro.build/config
export default defineConfig(generateAstroConfigure());

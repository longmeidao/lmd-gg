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
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkParentheticalEmphasis from './plugins/remark-parenthetical-emphasis';
import astroExpressiveCode from 'astro-expressive-code';
import rehypeFigure from 'rehype-figure';

import { remarkModifiedTime } from './plugins/remark-modified-time';
import { remarkReadingTime } from './plugins/remark-reading-time';
import { devWebWriter } from './plugins/dev-web-writer';
import { silenceAstroServerApp } from './plugins/silence-astro-server-app';
import slateConfig from './slate.config';

const remarkPlugins = [
  // 放宽 CJK 相邻标点对 `*`、`**` 的限制；`_` 仍遵循 CommonMark。
  remarkCjkFriendly,
  // 标记 `*（…）*` 形式的旁注。
  remarkParentheticalEmphasis,
  remarkGemoji,
  remarkMath,
  codeImport,
  remarkBlockContainers,
];

if (slateConfig.lastModified) remarkPlugins.push(remarkModifiedTime);
if (slateConfig.readTime) remarkPlugins.push(remarkReadingTime);

export default defineConfig({
  site: slateConfig.site,
  trailingSlash: 'never',
  // 关闭未使用且可能干扰 island 水合的开发工具栏。
  devToolbar: {
    enabled: false,
  },
  integrations: [
    astroExpressiveCode(),
    mdx(),
    react(),
    sitemap({
      ...slateConfig.sitemap,
      filter: (page) => !page.includes('/write'),
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  compressHTML: true,
  markdown: {
    processor: unified({
      remarkPlugins,
      rehypePlugins: [rehypeKatex, rehypeFigure],
    }),
  },
  vite: {
    plugins: [silenceAstroServerApp(), devWebWriter(), svgr(), tailwindcss()],
    // 动态导入无法被开发服务器自动发现，因此显式预打包 emoji-mart。
    // @emoji-mart/data 是 JSON 数据包，不参与预打包。
    optimizeDeps: {
      include: ['emoji-mart'],
    },
  },
});

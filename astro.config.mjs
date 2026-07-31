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
import { legacyBlogRedirects } from './plugins/legacy-blog-redirects';
import slateConfig from './slate.config';

function generateAstroConfigure() {
  const remarkPlugins = [
    // CommonMark 规定分隔符紧贴汉字又紧贴标点时不能开启强调，所以
    // `工具*（包括…）*并没有` 认不出来，得靠空格/换行隔开，而那些空格又会
    // 原样渲染成多余的空隙。这个插件按 CJK 规则放宽判定。
    // 注意：只对 `*`/`**` 生效，`_` 在 CommonMark 里是刻意保持严格的。
    remarkCjkFriendly,
    // 给 `*（…）*` 这种整段被括号包住的强调打上 em-aside，供样式区分旁注
    remarkParentheticalEmphasis,
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
        filter: (page) => !page.includes('/write'),
      }),
      legacyBlogRedirects(),
    ],
    // 站内链接悬停即预取，换页几乎无等待
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
      plugins: [devWebWriter(), svgr(), tailwindcss()],
      // emoji-mart 只在撰写面板里动态 import，dev 的依赖预打包扫不到它，
      // 首次点击表情就会 504。显式列出来让它随服务启动一起预打包。
      // 不含 @emoji-mart/data：那是个 JSON 数据包，预打包不了（会告警），
      // 它本来也不走这条路径。
      optimizeDeps: {
        include: ['emoji-mart'],
      },
    },
  };

  return astroConfig;
}

// https://astro.build/config
export default defineConfig(generateAstroConfigure());

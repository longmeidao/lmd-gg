/*
 * @file Theme configuration
 */
import { defineConfig } from './src/helpers/config-helper';

export default defineConfig({
  site: 'https://lmd.gg',
  lang: 'zh-CN',
  avatar: '/logo.png',
  title: '三墩冰室',
  description: '五年饮冰，来份烧仙草。',
  lastModified: true,
  readTime: true,
  footer: {
    copyright: '© 2025 三墩冰室',
  },
  navigations: [
    {
      label: "导览册",
      href: "/about"
    },
    {
      label: 'RSS',
      href: '/rss.xml'
    },
  ],
  algolia: {
    appId: 'K3HL1E7WTZ',
    apiKey: 'e9e6758cf004bd93db4ca97d7aec2e96',
    indexName: 'lmd'
  }
});

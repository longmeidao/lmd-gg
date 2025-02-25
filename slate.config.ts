/*
 * @file Theme configuration
 */
import { defineConfig } from './src/helpers/config-helper';

export default defineConfig({
  site: 'https://lmd.gg',
  lang: 'zh-CN',
  avatar: '/images/logo.png',
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
    }
  ],
  algolia: {
    appId: 'K3HL1E7WTZ',
    apiKey: 'e9e6758cf004bd93db4ca97d7aec2e96',
    indexName: 'lmd'
  },
  socialLinks: [
    {
      icon: 'mail',
      link: 'mailto:i@lmd.gg',
      ariaLabel: 'Email'
    },
    {
      icon: 'x',
      link: 'https://x.com/longmeidao',
      ariaLabel: 'X'
    },
    {
      icon: 'link',
      link: 'https://bento.me/lmd',
      ariaLabel: 'Bento'
    },
    {
      icon: 'rss',
      link: 'https://lmd.gg/rss.xml',
      ariaLabel: 'RSS'
    }
  ]
});
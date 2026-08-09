import { defineConfig } from './src/helpers/config-helper';

export default defineConfig({
  site: 'https://lmd.gg',
  lang: 'zh-CN',
  avatar: '/images/logo.png',
  title: '三墩冰室',
  lastModified: true,
  readTime: true,
  pagination: {
    pageSize: 20,
  },
  footer: {
    copyright: `© ${new Date().getFullYear()} 三墩冰室`,
  },
  /** 为需要稳定拉丁地址的合集显式指定 slug。 */
  collectionSlugs: {
    未分类: 'uncategorized',
  },
  navigations: [
    {
      label: '精选辑',
      href: '/featured',
    },
    {
      label: '档案室',
      href: '/archive',
    },
    {
      label: '导览册',
      href: '/about',
    },
  ],
  socialLinks: [
    {
      icon: 'mail',
      link: 'mailto:i@lmd.gg',
      ariaLabel: 'Email',
    },
    {
      icon: 'x',
      link: 'https://x.com/longmeidao',
      ariaLabel: 'X',
    },
    {
      icon: 'rss',
      link: 'https://lmd.gg/rss.xml',
      ariaLabel: 'RSS',
    },
  ],
});

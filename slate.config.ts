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
    copyright: `© ${new Date().getFullYear()} 三墩冰室`,
  },
  /**
   * 合集名 → URL slug。中文名自动生成的 slug 还是中文（`/未分类`），
   * 地址栏可读但传输时会被百分号编码，扔进 RSS 阅读器、外链、日志里都不好认，
   * 所以给默认合集显式配一个拉丁 slug。新合集想要 `/city-walks` 这种也写在这里。
   */
  collectionSlugs: {
    未分类: 'uncategorized',
  },
  navigations: [
    {
      label: '精选',
      href: '/featured',
    },
    {
      label: '归档',
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

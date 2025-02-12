/*
 * @file 主题配置
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
  }
});

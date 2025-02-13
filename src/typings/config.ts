import type { SitemapOptions } from '@astrojs/sitemap';

export const languages = ['zh-CN', 'en-US'] as const;
export type LangType = (typeof languages)[number];

export const theme = ['auto', 'light', 'dark'] as const;
/** 主题模式 */
export type ThemeMode = (typeof theme)[number];
export interface ThemeOptions {
  /** 模式 */
  mode: ThemeMode;
  /** 是否允许允许用户切换 */
  enableUserChange?: boolean;
}

export interface SlateConfig {
  /** 最终部署的链接 */
  site: string;
  /** 语言 */
  lang?: LangType;
  /** 主题 */
  theme?: ThemeOptions;
  /** 头像 */
  avatar?: string;
  /** sitemap 配置 */
  sitemap?: SitemapOptions;
  /** 网站标题 */
  title: string;
  /** 网站描述 */
  description: string;
  /** 导航栏配置 */
  navigations?: Array<{
    label: string;
    href: string;
  }>;
  /** 是否显示阅读时间 */
  readTime?: boolean;
  /** 是否显示最后修改时间 */
  lastModified?: boolean;
  /** docsearch 配置 */
  algolia?: {
    appId: string;
    apiKey: string;
    indexName: string;
  };
  /** 网站底部配置 */
  footer?: {
    copyright: string;
  };
  /** follow订阅认证配置 */
  follow?: {
    feedId: string;
    userId: string;
  };

}

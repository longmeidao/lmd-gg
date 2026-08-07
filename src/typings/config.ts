import type { SitemapOptions } from '@astrojs/sitemap';

export const languages = ['zh-CN', 'en-US'] as const;
export type LangType = (typeof languages)[number];

export type ThemeMode = 'auto' | 'light' | 'dark';
export interface ThemeOptions {
  mode: ThemeMode;
  enableUserChange?: boolean;
}

export interface SocialLink {
  icon: SocialLinkIcon;
  link: string;
  ariaLabel?: string;
}

type SocialLinkIcon =
  | 'dribbble'
  | 'facebook'
  | 'figma'
  | 'github'
  | 'instagram'
  | 'link'
  | 'mail'
  | 'notion'
  | 'rss'
  | 'threads'
  | 'x'
  | 'youtube'
  | { svg: string };

export interface SlateConfig {
  site: string;
  lang?: LangType;
  theme?: ThemeOptions;
  avatar?: string;
  sitemap?: SitemapOptions;
  title: string;
  description?: string;
  navigations?: Array<{
    label: string;
    href: string;
  }>;
  /**
   * 合集名 → URL slug 的映射。只在想要拉丁 slug（`/city-walks`）时才需要写；
   * 没有映射的合集会按名字自动生成，中文名会保留原样。
   */
  collectionSlugs?: Record<string, string>;
  readTime?: boolean;
  lastModified?: boolean;
  /** 首页、精选辑和合集页每页显示的内容组数；串文按一个内容组计算 */
  pagination?: {
    pageSize: number;
  };
  footer?: {
    copyright: string;
  };
  follow?: {
    feedId: string;
    userId: string;
  };
  socialLinks?: SocialLink[];
}

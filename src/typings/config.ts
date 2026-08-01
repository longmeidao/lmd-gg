import type { SitemapOptions } from '@astrojs/sitemap';

export const languages = ['zh-CN', 'en-US'] as const;
export type LangType = (typeof languages)[number];

/** Theme mode */
export type ThemeMode = 'auto' | 'light' | 'dark';
export interface ThemeOptions {
  /** Mode */
  mode: ThemeMode;
  /** Whether to allow user to change theme */
  enableUserChange?: boolean;
}

/** 社交链接配置 */
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
  /** Final deployment link */
  site: string;
  /** Language */
  lang?: LangType;
  /** Theme */
  theme?: ThemeOptions;
  /** Avatar */
  avatar?: string;
  /** Sitemap configuration */
  sitemap?: SitemapOptions;
  /** Website title */
  title: string;
  /** Website description */
  description?: string;
  /** 导航栏配置 */
  navigations?: Array<{
    label: string;
    href: string;
  }>;
  /**
   * 合集名 → URL slug 的映射。只在想要拉丁 slug（`/city-walks`）时才需要写；
   * 没有映射的合集会按名字自动生成，中文名会保留原样。
   */
  collectionSlugs?: Record<string, string>;
  /** Whether to show reading time */
  readTime?: boolean;
  /** Whether to show last modified time */
  lastModified?: boolean;
  /** 首页、精选和合集页每页显示的内容组数；串文按一个内容组计算 */
  pagination?: {
    pageSize: number;
  };
  /** Website footer configuration */
  footer?: {
    copyright: string;
  };
  /** Follow subscription authentication configuration */
  follow?: {
    feedId: string;
    userId: string;
  };
  /** 社交链接 */
  socialLinks?: SocialLink[];
}

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
  /** 合集名到 URL slug 的显式映射；未映射时自动生成。 */
  collectionSlugs?: Record<string, string>;
  readTime?: boolean;
  lastModified?: boolean;
  /** 每页内容组数；串文按一组计算。 */
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

import type { SitemapOptions } from '@astrojs/sitemap';

export const languages = ['zh-CN', 'en-US'] as const;
export type LangType = (typeof languages)[number];

export const theme = ['auto', 'light', 'dark'] as const;
/** Theme mode */
export type ThemeMode = (typeof theme)[number];
export interface ThemeOptions {
  /** Mode */
  mode: ThemeMode;
  /** Whether to allow user to change theme */
  enableUserChange?: boolean;
}

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
  description: string;
  /** 导航栏配置 */
  navigations?: Array<{
    label: string;
    href: string;
  }>;
  /** Whether to show reading time */
  readTime?: boolean;
  /** Whether to show last modified time */
  lastModified?: boolean;
  /** Docsearch configuration */
  algolia?: {
    appId: string;
    apiKey: string;
    indexName: string;
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

}

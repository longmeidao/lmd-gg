/*
 * @file: Configuration handler
 */
import type { SlateConfig, ThemeOptions } from '@/typings/config';

const defaultTheme: ThemeOptions = {
  mode: 'auto',
  enableUserChange: true,
};

/** Default configuration */
const defaultConfig: Partial<SlateConfig> = {
  lang: 'zh-CN',
  theme: defaultTheme,
  readTime: false,
  lastModified: false,
};

export function defineConfig(config: SlateConfig): SlateConfig {
  return {
    ...defaultConfig,
    ...config,
    theme: {
      ...defaultTheme,
      ...config.theme,
    },
  };
}

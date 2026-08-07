import slateConfig from '~@/slate.config';
import type { ThemeMode } from '@/typings/config';

export function getFullTitle(title: string) {
  return `${title}${title && slateConfig.title ? ' | ' : ''}${slateConfig.title}`;
}

export function setThemeMode(mode: ThemeMode) {
  document.documentElement.className = mode;
  document.documentElement.dataset.theme = mode;
}

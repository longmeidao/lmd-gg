import type { Plugin } from 'vite';

/**
 * 修正 Vite 全页重载时为 `astro:server-app` 虚拟模块误加 `.js` 的问题。
 * 见 withastro/astro#15952。
 */
export function silenceAstroServerApp(): Plugin {
  const MISRESOLVED_ID = 'astro:server-app.js';
  const REAL_ID = 'astro:server-app';

  return {
    name: 'lmd-silence-astro-server-app',
    apply: 'serve',
    enforce: 'pre',
    async resolveId(id) {
      if (id !== MISRESOLVED_ID) return null;
      // 交给 Astro 插件解析；skipSelf 默认开启，可避免递归。
      return this.resolve(REAL_ID);
    },
  };
}

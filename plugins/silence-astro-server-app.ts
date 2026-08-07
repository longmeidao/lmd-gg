import type { Plugin } from 'vite';

/**
 * 压制开发期这条误报：整页重载时 Vite 把虚拟模块 `astro:server-app` 当普通
 * 文件路径补上 `.js` 再找，谁也识别不了（Astro 自己的 resolveId 只认
 * 不带后缀的 id，见 astro/dist/vite-plugin-app/index.js）。上游
 * withastro/astro#15952 至今未修，astro 7.1.6 里依然存在。
 *
 * 触发条件（本项目全中）：含 Tailwind 的 CSS + @tailwindcss/vite + 改内容文件
 * 触发整页重载。这只是噪音：真正的导入在 configureServer 阶段早就成功了。
 * 这里把带 `.js` 的 id 转交给 Astro 自己的解析器；上游修好也不会冲突。
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
      // 交给 Astro 的 astro:server-app 插件去解析；skipSelf 默认为真，不会递归
      return this.resolve(REAL_ID);
    },
  };
}

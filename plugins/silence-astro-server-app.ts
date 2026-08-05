import type { Plugin } from 'vite';

/**
 * 压掉开发期这条报错：
 *
 *   [ERROR] [vite] An error happened during full reload
 *   Failed to load url astro:server-app.js (resolved id: astro:server-app.js).
 *   Does the file exist?
 *
 * 起因在 Astro 自己：它的虚拟模块叫 `astro:server-app`，没有按 Vite 的约定加
 * `virtual:` 前缀（见 astro/dist/vite-plugin-app/index.js）。Astro 自己的
 * resolveId 过滤正则是 `^astro:server-app$`，只认不带后缀的那个 id，正常导入
 * 没问题；但因为 id 不像虚拟模块，Vite 在整页重载时会把它当成普通文件路径，
 * 补上 `.js` 再去找 —— `astro:server-app.js` 谁都认不出来，于是报这一条。
 *
 * 触发条件要同时满足（上游 issue 里的复现步骤，本项目全中）：
 * 页面加载了含 Tailwind 的 CSS（common.css 里的 `@import 'tailwindcss'`）、
 * 用了 @tailwindcss/vite、并且发生整页重载（改内容文件就会）。
 *
 * 上游状态：withastro/astro#15952 报的就是这条，修复 PR #16191（把 id 加上
 * `virtual:` 前缀）被维护者误当成另一个已修问题给关掉了，至今没合并。
 * astro 7.1.6（当前最新）里依然存在。
 *
 * 这条只是噪音，不影响功能：真正的导入在 configureServer 阶段早就成功了，
 * 失败的是 Vite 多余的一次图遍历查找，报错之后页面照常加载。
 * 这里不吞日志，而是把这个带 `.js` 的 id 转交给 Astro 自己的解析器，
 * 让它落到真正的模块上 —— 上游哪天修好了，这个插件也不会造成冲突。
 *
 * 只在 dev 生效；构建阶段没有这条路径。
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

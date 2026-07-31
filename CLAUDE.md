# lmd-gg

Astro 个人站点 **lmd.gg**，Netlify 部署，slate-blog 主题。

> 本文件从 Codex 历史记忆迁移并人工筛选（2026-07）。已剔除 commit SHA、PR 编号、一次性排障记录等时效性内容，保留可复用的约定与结论。历史会话存档在 `history/`（已加入 .gitignore）。

## 技术栈

截至 2026-07：Astro 7.1.1 / Node 24 / pnpm 10.34.5。

- **pnpm 是唯一包管理器**，不要混用 npm/yarn
- 内容配置在 `src/content.config.ts`（不是旧的 `src/content/config.ts`），条目用 `post.id`
- 验证链路：`pnpm install` → `pnpm audit` → `pnpm lint` → `pnpm build`

## 内容写作

- **CJK 里的强调用 `*` 不要用 `_`**。CommonMark 规定分隔符紧贴汉字又紧贴标点时不能开启强调，`工具_（…）_并没有` 认不出来，加空格/换行才行，而那些空格会渲染成多余空隙。`remark-cjk-friendly` 已接入，放宽了 `*`/`**` 的判定（`工具*（…）*并没有` 直接可用），但 `_` 在 CommonMark 里是刻意保持严格的，插件不动它。

## Cloudflare（路线 A，迁移中）

站点仍是静态构建，`src/worker.ts` 只接管 `/api/*`，其余走静态资源。内容照旧是
git 里的 markdown，**没有数据库**。完整步骤见 `docs/cloudflare.md`。

- `Env` 由 `wrangler types` 从 `wrangler.jsonc` 生成到 `worker-configuration.d.ts`
  （538K，已 gitignore，`pnpm run tsc` 会自动重建）。**改了绑定不用手写接口。**
- Worker 的类型体系和浏览器 DOM 冲突（`HTMLSelectElement.remove()` 签名不同），
  所以 `src/worker.ts` 从主 tsconfig 排除，单独走 `tsconfig.worker.json`。
- 域名接管那段 `routes` 先注释着 —— 一旦打开就会从 Netlify 手里抢走 lmd.gg。
- 本地开发不受影响，仍走 `plugins/dev-web-writer.ts` 的 `/__lmd/*`。

## 提交约定

- **commitlint 拒绝 `chore:`**。允许的类型只有： `build / ci / docs / feat / fix / perf / refactor / revert / style / test`
- 大 diff 先拆分再提交：按「依赖/包管理器 → Astro API → 样式 → 内容」分组
- 提交前跑 `git diff --cached --check` 和项目 lint
- 个人项目不必每次都开 PR，直接 commit/push 可以；跨分支合并才建 PR

## 主题同步

`scripts/sync-latest-blog.sh` 会**整体合并**上游 slate-blog 仓库。本仓库有大量自定义，所以：**看实际 diff，只挑主题 CSS**，不要整仓替换。push 前确认 `origin` 是站点仓库。

## 外部服务健康检查

`scripts/check-external-services.mjs` 覆盖：生产站点/About、Umami、Bangumi CORS 和 RSS。

- 需要 `node --use-env-proxy`
- Bangumi 的 CORS 检查必须带 `Origin: https://lmd.gg`

## 已决策事项

- Decap CMS、Netlify Identity 与 Git Gateway 已决定移除；网页撰写将迁移到 Cloudflare 上的认证写作链路

## 工作方式

- 首选最新稳定版依赖/组件/Actions；官方稳定通道的运行时用最新 LTS
- 大版本升级只在「迁移 + 验证」都在范围内时做
- 编辑前先看 `git status`；不要在镜像目录里改真实仓库的东西
- 定时 Actions 只有在 workflow 和脚本都已提交推送后，才能说"已启用"
- 外部服务的偶发失败可以有限重试，但**不要掩盖 4xx 或内容错误**

## 未完成

- 自托管 Umami 统计因失修需要重搭
- About 页的 bgm.tv 番剧加载
- Cloudflare 上的认证写作、媒体和持久化链路仍待迁移

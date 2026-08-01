# lmd-gg

Astro 个人站点 **lmd.gg**，Cloudflare Workers 部署。项目最初基于 slate-blog，现已形成独立的信息架构、视觉与写作链路，不再同步上游主题。

> 本文件从 Codex 历史记忆迁移并人工筛选（2026-07）。已剔除 commit SHA、PR 编号、一次性排障记录等时效性内容，保留可复用的约定与结论。历史会话存档在 `history/`（已加入 .gitignore）。

## 技术栈

Astro 7 / React 19 / Tailwind CSS 4 / Node 24 / pnpm 10。

- **pnpm 是唯一包管理器**，不要混用 npm/yarn
- 内容配置在 `src/content.config.ts`（不是旧的 `src/content/config.ts`），条目用 `post.id`
- 完整验证链路：`pnpm verify`（格式、单测、浏览器冒烟、类型、lint、构建）

## 内容写作

- **CJK 里的强调用 `*` 不要用 `_`**。CommonMark 规定分隔符紧贴汉字又紧贴标点时不能开启强调，`工具_（…）_并没有` 认不出来，加空格/换行才行，而那些空格会渲染成多余空隙。`remark-cjk-friendly` 已接入，放宽了 `*`/`**` 的判定（`工具*（…）*并没有` 直接可用），但 `_` 在 CommonMark 里是刻意保持严格的，插件不动它。

## Cloudflare（路线 A，已上线）

站点是静态构建，`src/worker.ts` 只接管 `/api/*`，其余走静态资源。内容照旧是 git 里的 markdown，**没有数据库**。完整步骤见 `docs/cloudflare.md`。

- 后台鉴权走 **Cloudflare Access**：Zero Trust 里一个应用，Domain `lmd.gg` + Path `write`。**Access 里没填 path 的记录会覆盖整个主机名** —— 踩过一次，整站被锁在登录页后面，RSS 全断。改配置后必须 `curl -sI https://lmd.gg/` 确认是 200 不是 302。
- Access 的 Cookie 按整个域名下发，所以 `/api/admin/*` 不用单独建应用，Worker 自己验 JWT 就够。这也意味着**摘掉 Access 不会开出写入口**（验签失败即 401），真出问题可以放心先停用 Access 恢复站点。
- 部署 `pnpm cf:deploy`；查日志 `npx wrangler tail`。
- Cloudflare 会在 robots.txt 前面注入一段托管内容（封 AI 爬虫），不是本仓库生成的。

- `Env` 由 `wrangler types` 从 `wrangler.jsonc` 生成到 `worker-configuration.d.ts` （538K，已 gitignore，`pnpm run tsc` 会自动重建）。**改了绑定不用手写接口。**
- Worker 的类型体系和浏览器 DOM 冲突（`HTMLSelectElement.remove()` 签名不同），所以 `src/worker.ts` 从主 tsconfig 排除，单独走 `tsconfig.worker.json`。
- 本地开发走 `plugins/dev-web-writer.ts` 的 `/__lmd/*`，直接绕过生产鉴权；线上与本地共用 `src/domain/content-contract.ts` 的 slug、大小限制、草稿元数据和上传命名规则。
- 生产草稿不进入静态页面；归档页鉴权成功后通过后台接口读取 GitHub 中的草稿元数据。

## 图片

**R2 里只存原件,不进仓库,也不存派生文件。** 上传接口会实测 Cloudflare Image Transformations 的候选响应,只有格式正确且比原件更小时才把派生地址写进文章。

- 原件在 `images/originals/`，文件名包含时间、原名和随机后缀，避免同秒同名覆盖
- PNG 正文先试原尺寸无损 WebP q100,再试原尺寸 PNG8 q85;两者都不比原件小就用原件
- JPEG/WebP 正文使用 `width=1200,fit=scale-down,format=webp,quality=92`,同样先比较体积
- 归档方格使用 `width=340,fit=scale-down` 的 WebP q92
- 视频、音频和其他文件直接使用原件,不经过 Image Transformations
- `onerror=redirect`:超出免费额度时回退到原件,不裂图

免费额度每月 5000 次唯一转换(按「图片 × 参数」每月算一次),远远用不完。上传时最多探测两个候选;原件始终保留,压缩失败不会阻断发布。

## 部署

**push 到 main 会触发 `.github/workflows/deploy.yml` 自动构建部署。** 撰写面板发文章 = Worker 往仓库提交 → 这个工作流重新构建 → 上线,约 1–2 分钟。

- 需要仓库 secrets:`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- checkout 必须 `fetch-depth: 0` —— `remark-modified-time` 要读每个文件的提交历史算「最后修改」,浅克隆会让日期全变成最近一次构建时间
- 手动部署仍可用 `pnpm cf:deploy`

## 提交约定

- **commitlint 拒绝 `chore:`**。允许的类型只有： `build / ci / docs / feat / fix / perf / refactor / revert / style / test`
- 大 diff 先拆分再提交：按「依赖/包管理器 → Astro API → 样式 → 内容」分组
- 提交前跑 `git diff --cached --check` 和项目 lint
- 个人项目不必每次都开 PR，直接 commit/push 可以；跨分支合并才建 PR

## 外部服务健康检查

`scripts/check-external-services.mjs` 覆盖：生产站点/About、Umami、Bangumi CORS 和 RSS。

- 需要 `node --use-env-proxy`
- Bangumi 的 CORS 检查必须带 `Origin: https://lmd.gg`

## 已决策事项

- Decap CMS、Netlify Identity 与 Git Gateway 已移除；网页撰写已迁到 Cloudflare（Access + Worker + R2）

## 工作方式

- 首选最新稳定版依赖/组件/Actions；官方稳定通道的运行时用最新 LTS
- 大版本升级只在「迁移 + 验证」都在范围内时做
- 编辑前先看 `git status`；不要在镜像目录里改真实仓库的东西
- 定时 Actions 只有在 workflow 和脚本都已提交推送后，才能说"已启用"
- 外部服务的偶发失败可以有限重试，但**不要掩盖 4xx 或内容错误**

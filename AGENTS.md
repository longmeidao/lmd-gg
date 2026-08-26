# lmd-gg 项目约定

## 项目概况

lmd.gg 是 Astro 7 静态个人站点，部署到 Cloudflare Workers。项目最初基于 Slate Blog，但现在已有独立的信息架构、视觉和网页写作链路，不再同步上游主题。

- Node 使用最新 LTS（当前约束见 `package.json`），pnpm 是唯一包管理器。
- 内容配置位于 `src/content.config.ts`，内容条目标识使用 `post.id`。
- 站点内容在 Git 中，没有数据库；Worker 只处理 `/api/*`。
- 修改前先确认 Git 根目录、remote、提交与 `git status`，不要在镜像目录中修改真实仓库，也不要覆盖未提交改动。
- 通过 `README.md`、`TODO.md`、`docs/` 和已忽略的 `history/` 恢复项目上下文；项目约束以本文件为唯一代理规则源。

## 目录职责

- `src/pages/`：Astro 路由入口，只做页面组装和路由数据准备。
- `src/components/`：Astro/React 视图组件。
- `src/helpers/`：页面查询、RSS、URL、筛选、分页等共享逻辑。
- `src/domain/`：Worker 与本地开发插件共用的内容契约。
- `src/scripts/`：浏览器脚本和网页撰写器模块。
- `src/worker.ts`：Cloudflare Worker 路由、鉴权、GitHub/R2 操作。
- `plugins/`：Astro/Vite 本地开发与 Markdown 插件。
- `scripts/`：构建后验证脚本。
- `tests/`：Vitest 与 Workers 测试。

优先把可测试的纯逻辑放进 `helpers`、`domain` 或对应功能子目录；页面和浏览器入口只保留编排。不要为一次调用创建无意义抽象，也不要把 Worker 专用类型混入主 `tsconfig`。

## 验证要求

完整验证运行：

```bash
pnpm verify
```

它必须覆盖格式、单测、TypeScript、ESLint、Astro 检查、静态构建、Pagefind 与 RSS 产物验证。构建成功不等于产物正确；RSS 必须继续检查链接不存在 `/undefined`，且指向真实生成的页面。

Worker 类型由 `wrangler types` 根据 `wrangler.jsonc` 生成到已忽略的 `worker-configuration.d.ts`，不要手写 `Env`。`src/worker.ts` 因 Workers 类型与 DOM 类型冲突，继续使用 `tsconfig.worker.json` 单独检查。

## 内容与路由

- Markdown/MDX 位于 `src/content/post/`。
- 文件 `src/content/post/example.md` 的规范地址是 `/example`。
- HTML 路由除根路径外不使用尾斜杠。
- 旧 `/blog/:slug` 通过 `public/_redirects` 301 跳转。
- 草稿使用 `draft: true`，生产静态构建不能公开草稿。
- CJK 强调使用 `*`/`**`，不要用 `_`；相关规则由 `remark-cjk-friendly` 处理。
- Heti 只用于文章和 feed 的语义区域；装饰性 `·` 保留 `heti-skip`。

## 写作与发布

本地 `/write` 通过 `plugins/dev-web-writer.ts` 写入内容；生产由 Cloudflare Access 与 Worker 再次鉴权，通过 GitHub Git Data API 原子提交。浏览器端、本地插件和 Worker 必须共用 `src/domain/content-contract.ts` 的 slug、大小、草稿和上传规则。

生产草稿不进入静态页面；归档页只有鉴权成功后才能通过后台接口读取草稿摘要。涉及写作器、草稿、串文或归档筛选的修改，必须同时核对本地与生产路径，避免两套渲染或状态规则分叉。

## 图片与媒体

- R2 只保存 `images/originals/` 原件，不保存派生文件，也不把原件提交进仓库。
- Image Transformations 只有在候选格式正确且比原件更小时才写入派生地址。
- PNG 正文优先无损 WebP q100，再试 PNG8 q85；都不更小时保留原件。
- JPEG/WebP 正文使用宽 1200、`scale-down`、WebP q92。
- 归档缩略图使用宽 340、`scale-down`、WebP q92。
- 视频、音频和其他文件不做图片转换；转换失败必须回退原件。

## Cloudflare 与部署

- Access 应用只保护 `lmd.gg/write`；不要创建覆盖整个主机名的无 path 规则。
- `/api/admin/*` 由 Worker 验证 Access JWT，摘掉 Access 不会直接开放写入口。
- 修改 Access 后检查公开首页仍返回 200，而不是被登录跳转覆盖。
- push 到 `main` 触发 `.github/workflows/deploy.yml`；部署 checkout 必须保留 `fetch-depth: 0`，否则修改时间会失真。
- 手动部署使用 `pnpm cf:deploy`；部署后分别报告代码、提交、部署和线上验证状态。
- 新增或修改绑定后重新生成类型；不要把 token、私钥或生成的环境类型提交进仓库。

## 工程约定

- 首选最新稳定依赖；大版本升级必须同时包含迁移和验证。
- 保留现有路由、SEO、RSS、Bangumi、串文和写作行为，重构不应顺带改变产品设计。
- 删除代码前确认没有动态导入、Astro 约定式路由或构建脚本引用。
- 避免全仓机械格式化制造无关 diff。
- 定时 Actions 只有在 workflow 和脚本均已提交推送后才能称为已启用；外部服务失败可以有限重试，但不要用重试掩盖 4xx 或内容错误。
- commitlint 不接受 `chore:`；允许 `build / ci / docs / feat / fix / perf / refactor / revert / style / test`。

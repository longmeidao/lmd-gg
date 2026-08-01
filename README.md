# lmd.gg

三墩冰室的源码。项目最初基于 Slate Blog，目前已经整合 jant 的内容形式、串文、归档筛选与网页撰写体验，并迁移到 Cloudflare Workers。

## 技术栈

- Astro 7 静态站点、TypeScript、React 19
- Tailwind CSS 4、Radix Colors、Heti
- Markdown/MDX、Remark/Rehype、KaTeX、Expressive Code
- Pagefind 静态全文搜索、Astro RSS 与 Sitemap
- Cloudflare Workers、Access、R2、Image Transformations
- GitHub Git Data API 原子提交与 Actions 自动部署
- pnpm 10、ESLint、Prettier、Vitest/Miniflare、Playwright

## 本地开发

```bash
pnpm install
pnpm dev
```

本地 `/write` 直接绕过生产鉴权，内容写入 `src/content/post/`，媒体写入 `public/media/uploads/`。生产环境由 Cloudflare Access 与 Worker 再次验签，内容以单个 Git commit 提交到 GitHub，媒体写入 R2。

## 验证

```bash
pnpm verify
```

该命令依次检查格式、运行 Worker/纯逻辑单测、Chrome 冒烟测试、TypeScript、ESLint、Astro 检查和完整静态构建。

## 内容与 URL

- 内容位于 `src/content/post/`，支持 Markdown 与 MDX。
- 文件 `src/content/post/example.md` 的规范地址是 `/example`。
- 站内 HTML 页面统一不使用尾斜杠；根路径 `/` 除外。
- 旧 `/blog/:slug` 由 `public/_redirects` 301 到 `/:slug`。
- 草稿使用 `draft: true`，生产静态构建不会生成公开页面；登录后可在归档页的“可见性 → 草稿”中管理。

主要 frontmatter 字段：

| 字段               | 说明                                        |
| ------------------ | ------------------------------------------- |
| `title`            | 标题；无标题随记可省略                      |
| `kind`             | `article`、`note`、`quote`、`link`、`photo` |
| `pubDate`          | 发布日期；公开内容必填                      |
| `draft`            | 草稿标记                                    |
| `collections`      | 合集列表                                    |
| `thread`           | 串文标识                                    |
| `externalUrl`      | 链接或引文来源地址                          |
| `source`           | 引文来源名称                                |
| `featured`         | 精选标记                                    |
| `hiddenFromLatest` | 不在首页最新列表显示                        |

## 目录

```text
plugins/             Astro/Vite 本地开发插件
public/              原样复制的静态文件与重定向规则
scripts/             构建后验证、外部服务健康检查
src/components/      Astro/React 组件
src/content/         内容集合与 Markdown
src/domain/          Worker 与本地开发共用的内容契约
src/helpers/         页面查询、RSS、URL、筛选等共享逻辑
src/pages/           静态页面与动态路由
src/scripts/         浏览器脚本与撰写器模块
src/worker.ts        只接管 /api/* 的 Cloudflare Worker
tests/               Vitest/Workers 测试
e2e/                 Playwright 浏览器冒烟测试
```

## 部署

推送到 `main` 后，`.github/workflows/deploy.yml` 会执行 `pnpm verify`，通过后由 Wrangler 部署到 Cloudflare。Worker 所需绑定与变量见 `wrangler.jsonc`，详细配置见 `docs/cloudflare.md`。

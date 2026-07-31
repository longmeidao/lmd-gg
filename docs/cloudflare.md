# 迁到 Cloudflare（路线 A）

站点保持静态构建，只加一个 Worker 接管 `/api/*`。内容依旧是 git 里的 markdown，
没有数据库。结构和色览（sesese-se）一致，那边已经跑了几个月。

```
浏览器 ──▶ Cloudflare
             ├─ /api/*  ──▶ Worker（src/worker.ts）
             │               ├─ 校验 Cloudflare Access 的 JWT
             │               ├─ 写 GitHub 仓库（GITHUB_TOKEN）
             │               └─ 传 R2（lmd-gg-media）
             └─ 其余     ──▶ 静态资源（dist/）
                             ▲
                             └── GitHub push 触发重新构建
```

发布一篇文章 = Worker 提交到仓库 → CI 构建 → 部署，**延迟约 1–2 分钟**。
要秒级就得把内容搬进 D1 改 SSR（路线 B），那是另一回事。

## 已经做好的

- `src/worker.ts` —— 后台接口，`/api/admin/{session,posts,upload}`
- `wrangler.jsonc` —— 绑定、变量、静态资源配置
- R2 桶 `lmd-gg-media` —— 已创建
- **Worker 已部署**：<https://lmd-gg.longmeidao.workers.dev>（未接管 lmd.gg）
- `pnpm cf:deploy` / `pnpm cf:dev`

已在 workers.dev 上验证：静态页面全部 200、`_redirects` 的 `/blog/*` 301 生效、
pagefind 索引可取、`/write` 及其 JS/CSS 正常；`/api/admin/session` 返回
`{"authenticated":false}`，其余后台接口一律 401 —— **失败关闭**。

## 你要在 Cloudflare 控制台做的

### 1. R2 公开访问

R2 → `lmd-gg-media` → Settings → Public access → 绑自定义域名 `media.lmd.gg`。
绑好之后确认 `wrangler.jsonc` 里的 `MEDIA_PUBLIC_URL` 和它一致。

命令行也行，但要 zone ID（在 lmd.gg 的 Overview 页右下角）：

```bash
npx wrangler r2 bucket domain add lmd-gg-media --domain media.lmd.gg --zone-id <ZONE_ID>
```

### 2. Zero Trust → Access 应用

Zero Trust → Access → Applications → Add an application → Self-hosted：

- Application domain：`lmd.gg`，Path 分别加 `write` 和 `api/admin`
- Policy：Allow，条件选 Emails，填你自己的邮箱
- 登录方式：One-time PIN（免费额度够用，不用接第三方 IdP）

建好之后回到应用的 Overview，复制 **Application Audience (AUD) Tag**，
连同你的团队域名一起填进 `wrangler.jsonc`：

```jsonc
"ACCESS_TEAM_DOMAIN": "https://你的团队名.cloudflareaccess.com",
"ACCESS_AUD": "刚复制的那串 AUD"
```

> Worker 自己也会验一遍 JWT 签名。只靠 Access 在边缘拦截是不够的 ——
> 绕过自定义域名直接打 `*.workers.dev` 就没人管了。

### 3. GitHub token

生成一个 fine-grained PAT，**只授权 `longmeidao/lmd-gg` 这一个仓库**，
权限只勾 `Contents: Read and write`，然后：

```bash
npx wrangler secret put GITHUB_TOKEN
```

### 4. 部署

```bash
pnpm cf:deploy
```

`routes` 还注释着，所以**不会碰 lmd.gg**，Netlify 继续正常服务。

> **workers.dev 上测不出 Access。** Access 是绑在 zone（lmd.gg）上的，
> `*.workers.dev` 不属于这个 zone，所以那边打开 `/write` 不会跳登录页，
> `/api/admin/session` 也永远是 `{"authenticated":false}`（拿不到 Access Cookie）。
>
> 在 workers.dev 上能验的只有：静态页面是否正常、后台接口是否**失败关闭**。
> 登录流程必须等域名切过来之后才能测。

### 5. 切换域名，然后才测登录

取消 `wrangler.jsonc` 里 `routes` 那段的注释，重新部署，再把 Netlify 上的域名解绑。

切过来之后测：

- 打开 `https://lmd.gg/write` → 跳 Access 登录页，收邮件验证码
- 登录后 `https://lmd.gg/api/admin/session` → `{"authenticated":true}`
- 换个无痕窗口直接请求 `/api/admin/posts` → 401

**Netlify 的项目先留着别删**，万一要回滚，把 DNS 指回去就行。
真被 Access 挡在外面也不影响发文章 —— 内容是 git 里的 markdown，直接 commit 就能发。

排查用 `npx wrangler tail`：Access 没配好时 Worker 会打一条
`access_not_configured` / `access_certs_failed` 的日志。

## 本地开发不受影响

`astro dev` 时走的仍然是 `plugins/dev-web-writer.ts` 里的 `/__lmd/*`，
不需要 Access 也不需要 token。前端会按 `import.meta.env.DEV` 自动选端点。

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
- R2 桶 `lmd-gg-media` —— 已创建，`media.lmd.gg` 已绑定（ssl active）
- **Worker 已部署**，并已接管 lmd.gg
- `pnpm cf:deploy` / `pnpm cf:dev`

已在 workers.dev 上验证：静态页面全部 200、`_redirects` 的 `/blog/*` 301 生效、
pagefind 索引可取、`/write` 及其 JS/CSS 正常；`/api/admin/session` 返回
`{"authenticated":false}`，其余后台接口一律 401 —— **失败关闭**。

## 你要在 Cloudflare 控制台做的

### 1. R2 公开访问（已完成）

```bash
npx wrangler r2 bucket domain add lmd-gg-media --domain media.lmd.gg --zone-id <ZONE_ID>
```

**只有撰写面板上传的媒体走 R2。** R2 保留原件；上传接口会探测 Cloudflare
Image Transformations 的候选响应，只有格式正确且体积更小时才返回派生地址，
避免固定编码导致截图发糊或文件越压越大。

所以 `media.lmd.gg` 在传第一张图之前一直是 404，属正常。

### 2. Zero Trust → Access 应用

**这一步最容易配错，配错的后果是整个站点变成要登录才能看。**

Access 的一个 self-hosted 应用 = 一个域名 + 一个可选路径。**路径留空就等于
保护整个主机名**。所以要建**两个**应用，各自限定路径：

| 应用 | Application domain | Path |
|---|---|---|
| 撰写页 | `lmd.gg` | `write` |
| 后台接口 | `lmd.gg` | `api/admin` |

两个都配同一条策略：Allow，条件 Emails，填你自己的邮箱；登录方式 One-time PIN。

Path 不带前导斜杠。**千万不要把 domain 填成 `*.workers.dev` 或不填 path** ——
那样首页、归档、RSS、pagefind 全会被拦去登录。

验证方法（切完域名之后）：

```bash
# 公开页面必须是 200，不能是 302
curl -sI https://lmd.gg/ | head -1
curl -sI https://lmd.gg/rss.xml | head -1
# 受保护的必须 302 到 cloudflareaccess.com
curl -sI https://lmd.gg/write/ | grep -i location
```

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

### 4. 部署与切换（已完成）

```bash
pnpm cf:deploy
```

lmd.gg 的自定义域名是在**控制台**直接绑到 Worker 上的（Workers → Settings →
Domains & Routes），`wrangler.jsonc` 里的 `routes` 保持注释。两种方式二选一，
别同时配。

切换后实测：公开页面（首页、归档、精选、合集、about、两个 RSS、pagefind）
全部 200；`/write` 和 `/api/admin/*` 302 到 Access；`/blog/*` 301 到新地址。

### 5. 回滚

Netlify 项目仍然留着。真要回滚：把 lmd.gg 的 DNS 记录改回指向 Netlify 即可。

就算 Access 出问题也不必回滚 —— 停用 Access 只会让 `/write` 页面变公开，
写接口仍由 Worker 验签拦住（401）。内容在 git 里，直接 commit 照样能发。

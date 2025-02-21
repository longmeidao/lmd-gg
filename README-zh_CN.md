# Slate blog

[English](./README.md) · 中文

## ✨ 特性

- 极简风主题，设配多端场景, 支持 `light` 和 `dark` 模式。
- 傻瓜式配置，0基础快速上手部署。
- 支持文章草稿，本地允许预览，生产构建自动过滤。
- 支持 algolia 搜索和 follow 订阅认证配置开启。
- 完善的 SEO 优化。

## 🪜 框架

- Astro + React + Typescript
- Tailwindcss + @radix-ui/colors
- Docsearch

## 🔨 使用

```bash
# 启动本地服务器
npm run dev
# or
yarn dev
# or
pnpm dev

# 构建
npm run build
# or
yarn build
# or
pnpm build
```

> 如果您 fork 仓库后，将仓库设置为私有时，默认会失去与上游仓库关联，可以通过运行 `pnpm sync-latest` 同步 Slate Blog 最新版本代码。

## 🗂 目录

```
- plugins // 自定义插件
- src
  - assets
  - components // 组件
  - content // 内容集合
  - helpers // 业务逻辑
  - pages
  - typings // 通用类型
```

## 配置

通过根目录下的 `slate.config.ts` 进行主题配置。

| 选项 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| site | 最终部署的链接 | `string` | - |
| title | 网站标题 | `string` | - |
| description | 网站描述 | `string` | - |
| lang | 语言 | `string` | `zh-CN` |
| theme | 主题 | `{ mode: 'auto' \| 'light' \| 'dark', enableUserChange: boolean }` | `{ mode: 'auto', enableUserChange: true }` |
| avatar | 头像 | `string` | - |
| sitemap | 网站 sitemap 配置 | [SitemapOptions](https://docs.astro.build/zh-cn/guides/integrations-guide/sitemap/) | - |
| readTime | 是否显示阅读时间 | `boolean` | `false` |
| lastModified | 是否显示最后修改时间 | `boolean` | `false` |
| algolia | docsearch 配置 | `{ appId: string, apiKey: string, indexName: string }` | - |
| follow | follow 订阅认证配置 | `{ feedId: string, userId: string }` | - |
| footer | 网站底部配置 | `{ copyright: string }` | - |
| socialLinks | 社交链接配置 | `{ icon: [SocialLinkIcon](#SocialLinkIcon), link: string, ariaLabel?: string }` | - |

### SocialLinkIcon

```ts
type SocialLinkIcon =
  | 'dribbble'
  | 'facebook'
  | 'figma'
  | 'github'
  | 'instagram'
  | 'jike'
  | 'link'
  | 'notion'
  | 'npm'
  | 'rednote'
  | 'rss'
  | 'threads'
  | 'stackoverflow'
  | 'weibo'
  | 'x'
  | 'youtube'
  | { svg: string }
```

### algolia 申请

1. 先将部署站点。
2. 在 [algolia](https://docsearch.algolia.com/apply/) 申请应用 `apiKey`。
3. 申请完成后且通过，在 `slate.config.ts` 中配置 `algolia` 。
4. 重新部署。

### follow 订阅认证

1. 注册 [follow](https://follow.is/) 账号。
2. 部署站点。
3. 在 `follow` 点击 `+` 号，选择 `RSS` 订阅，填入 `rss` 链接，一般为 `[site]/rss.xml`, `site` 为 `slate.config.ts` 配置文件中 `site` 的值。
4. 重新部署。


## 文章 frontmatter 说明

| 选项 | 说明 | 类型 | 是否必须 |
| --- | --- | --- | --- |
| title | 文章标题 | `string` | 是 |
| description | 文章描述 | `string` | 否 |
| tags | 文章标签 | `string[]` | 否 |
| draft | 是否是草稿，当不传或者为 `false` 时，`pubDate` 必须传；草稿仅本地预览可见 | `boolean` | 否 |
| pubDate | 文章发布时间 | `date` | 否，当 `draft` 为 `false` 时，必须传 |

**详细可以查看 `src/content/config.ts` 文件**

### 示例

```md
---
title: 40 questions
description: This repo maintains revisons and translations to the list of 40 questions I ask myself each year and each decade.
tags:
  - Life
  - Thinking
  - Writing
pubDate: 2025-01-06
---
```

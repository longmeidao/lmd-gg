import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/post' }),
  schema: z
    .object({
      title: z.string().optional(),
      /** 条目形式，决定首页和详情页的版式 */
      kind: z
        .enum(['article', 'note', 'quote', 'link', 'photo'])
        .default('article'),
      /** 链接和引文指向的原文地址 */
      externalUrl: z.url().optional(),
      /** 引文出处，显示在引文卡片下方 */
      source: z.string().optional(),
      /** 引文和链接后面附的个人看法 */
      commentary: z.string().optional(),
      /** 串文的键名，同键的条目在 feed 里连成一串 */
      thread: z.string().optional(),
      /** 已发布、地址能访问，但不出现在首页最新里 */
      hiddenFromLatest: z.boolean().optional(),
      /** 精选辑标记：收进 /featured，并进入默认 RSS */
      featured: z.boolean().optional(),
      /**
       * 附文：正文最后一段 `---` 之后的内容是补充说明（撰写面板的「附文」）。
       * 正文里的 `---` 也可能只是作者手写的分隔线，所以靠这个字段而不是猜。
       */
      attached: z.boolean().optional(),
      /** 置顶：在首页最新里排到最前 */
      pinned: z.boolean().optional(),
      rating: z.number().int().min(1).max(5).optional(),
      collections: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
      /** 非草稿必填，见下面的 superRefine */
      pubDate: z.coerce.date().optional(),
    })
    .superRefine((data, ctx) => {
      if (
        (data.kind === 'article' || data.kind === 'link') &&
        !data.title?.trim()
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `${data.kind} entries require a title`,
          path: ['title'],
        });
      }
      if (data.draft !== true && data.pubDate === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'When draft is false, pubDate is required',
          path: ['pubDate'],
        });
      }
    }),
});

export const collections = { post: postCollection };

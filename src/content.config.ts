import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/post' }),
  schema: z
    .object({
      /** Title */
      title: z.string().optional(),
      /** Homepage presentation */
      kind: z
        .enum(['article', 'note', 'quote', 'link', 'photo'])
        .default('article'),
      /** Optional external destination for link and quote entries */
      externalUrl: z.url().optional(),
      /** Optional source label for quoted or linked content */
      source: z.string().optional(),
      /** Optional author commentary shown after quoted or linked content */
      commentary: z.string().optional(),
      /** Optional thread identifier used to group related homepage entries */
      thread: z.string().optional(),
      /** Published and addressable, but omitted from the homepage feed */
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
      /** Optional one-to-five-star rating */
      rating: z.number().int().min(1).max(5).optional(),
      /** Collections this entry belongs to (合集) */
      collections: z.array(z.string()).optional(),
      /** Whether it's a draft */
      draft: z.boolean().optional(),
      /** Publish date (required when not draft) */
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

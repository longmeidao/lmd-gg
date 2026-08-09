import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/post' }),
  schema: z
    .object({
      title: z.string().optional(),
      kind: z
        .enum(['article', 'note', 'quote', 'link', 'photo'])
        .default('article'),
      externalUrl: z.url().optional(),
      source: z.string().optional(),
      commentary: z.string().optional(),
      thread: z.string().optional(),
      /** 已发布但不显示在首页最新内容中。 */
      hiddenFromLatest: z.boolean().optional(),
      /** 收录到 /featured 和默认 RSS。 */
      featured: z.boolean().optional(),
      /** 明确标记正文末尾的补充说明。 */
      attached: z.boolean().optional(),
      pinned: z.boolean().optional(),
      rating: z.number().int().min(1).max(5).optional(),
      collections: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
      /** 非草稿必填。 */
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

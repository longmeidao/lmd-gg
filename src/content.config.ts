import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/post' }),
  schema: z
    .object({
      /** Title */
      title: z.string(),
      /** Description */
      description: z.string().optional(),
      /** Tags */
      tags: z.array(z.string()).optional(),
      /** Whether it's a draft */
      draft: z.boolean().optional(),
      /** Publish date (required when not draft) */
      pubDate: z.coerce.date().optional(),
    })
    .refine(
      (data) => {
        // Drafts may omit pubDate; published posts must include it.
        if (data.draft === true) {
          return true;
        }
        return data.pubDate !== undefined;
      },
      {
        message: 'When draft is false, pubDate is required',
        path: ['pubDate'],
      },
    ),
});

export const collections = { post: postCollection };

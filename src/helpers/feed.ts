import { getContainerRenderer as mdxContainerRenderer } from '@astrojs/mdx/container-renderer';
import type { RSSFeedItem } from '@astrojs/rss';
import { experimental_AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import type { PostEntry } from './content';
import { byPubDateDesc } from './content';
import { getPostDisplayTitle, getPostExcerpt, getPostPath } from './post';

/** Astro Container 还是实验 API，把它限制在 RSS 适配层，页面查询不依赖它 */
export const buildRssItems = async (
  posts: PostEntry[],
): Promise<RSSFeedItem[]> => {
  const renderers = await loadRenderers([mdxContainerRenderer()]);
  const container = await experimental_AstroContainer.create({ renderers });

  return Promise.all(
    [...posts].sort(byPubDateDesc).map(async (post) => {
      const html = await container.renderToString((await render(post)).Content);
      return {
        link: getPostPath(post.id),
        title: getPostDisplayTitle(post.data),
        description: getPostExcerpt(post.body),
        pubDate: post.data.pubDate,
        categories: post.data.collections,
        content: sanitizeHtml(html, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        }),
      };
    }),
  );
};

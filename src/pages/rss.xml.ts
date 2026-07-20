import rss, { type RSSFeedItem, type RSSOptions } from '@astrojs/rss';
import { experimental_AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getCollection, render } from 'astro:content';
import { getContainerRenderer as mdxContainerRenderer } from '@astrojs/mdx/container-renderer';
import type { APIContext } from 'astro';
import sanitizeHtml from 'sanitize-html';
import slateConfig from '~@/slate.config';

export async function GET(context: APIContext) {
  const blog = await getCollection('post', ({ data }) => data.draft !== true);
  const renderers = await loadRenderers([mdxContainerRenderer()]);
  const container = await experimental_AstroContainer.create({ renderers });

  const postItems: RSSFeedItem[] = await Promise.all(
    blog
      .sort(
        (a, b) =>
          (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0),
      )
      .map(async (post) => {
        const { Content } = await render(post);
        const html = await container.renderToString(Content);

        return {
          link: `/blog/${post.id}/`,
          title: post.data.title,
          description: post.data.description,
          pubDate: post.data.pubDate,
          categories: post.data.tags,
          content: sanitizeHtml(html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
          }),
        };
      }),
  );

  const rssOptions: RSSOptions = {
    stylesheet: '/pretty-feed-v3.xsl',
    title: slateConfig.title,
    description: slateConfig.description,
    site: context.site ?? slateConfig.site,
    trailingSlash: false,
    items: postItems,
  };

  if (slateConfig.follow) {
    rssOptions.customData = `<follow_challenge>
      <feedId>${slateConfig.follow.feedId}</feedId>
      <userId>${slateConfig.follow.userId}</userId>
    </follow_challenge>`;
  }

  return rss(rssOptions);
}

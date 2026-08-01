import rss, { type RSSOptions } from '@astrojs/rss';
import type { APIContext } from 'astro';
import slateConfig from '~@/slate.config';
import { getSitePosts } from '@/helpers/content';
import { buildRssItems } from '@/helpers/feed';

export async function GET(context: APIContext) {
  const postItems = await buildRssItems(
    await getSitePosts(({ data }) => data.kind === 'article'),
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

import rss, { type RSSOptions } from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import slateConfig from '~@/slate.config';
import { buildCollectionIndex } from '@/helpers/collection';
import { getSitePosts, type PostEntry } from '@/helpers/content';
import { buildRssItems } from '@/helpers/feed';

/**
 * 每个合集一份 RSS，地址是 `/rss/<合集 slug>.xml`。
 *
 * 和主 feed 不同，这里不限定 kind —— 合集里本来就混着随记、引文、链接，
 * 只筛掉草稿。
 */
export async function getStaticPaths() {
  const posts = await getSitePosts();

  return buildCollectionIndex(posts).map((entry) => ({
    params: { collection: entry.slug },
    props: { name: entry.name, ids: entry.items.map((post) => post.id) },
  }));
}

interface Props {
  name: string;
  ids: string[];
}

export async function GET(context: APIContext) {
  const { name, ids } = context.props as Props;
  const all = await getCollection('post');
  const posts = ids
    .map((id) => all.find((post) => post.id === id))
    .filter((post): post is PostEntry => Boolean(post));

  const items = await buildRssItems(posts);

  const rssOptions: RSSOptions = {
    stylesheet: '/pretty-feed-v3.xsl',
    title: `${name} - ${slateConfig.title}`,
    description: `合集「${name}」下的内容。`,
    site: context.site ?? slateConfig.site,
    trailingSlash: false,
    items,
  };

  return rss(rssOptions);
}

import rss, { type RSSFeedItem, type RSSOptions } from '@astrojs/rss';
import { experimental_AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getCollection, render, type CollectionEntry } from 'astro:content';
import { getContainerRenderer as mdxContainerRenderer } from '@astrojs/mdx/container-renderer';
import type { APIContext } from 'astro';
import sanitizeHtml from 'sanitize-html';
import slateConfig from '~@/slate.config';
import {
  getPostDisplayTitle,
  getPostExcerpt,
  getPostPath,
} from '@/helpers/post';
import { buildCollectionIndex } from '@/helpers/collection';

type PostEntry = CollectionEntry<'post'>;

/**
 * 每个合集一份 RSS，地址是 `/rss/<合集 slug>.xml`。
 *
 * 和主 feed 不同，这里不限定 kind —— 合集里本来就混着随记、引文、链接，
 * 只筛掉草稿。
 */
export async function getStaticPaths() {
  const posts = await getCollection(
    'post',
    ({ data }: PostEntry) => data.draft !== true,
  );

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

  const renderers = await loadRenderers([mdxContainerRenderer()]);
  const container = await experimental_AstroContainer.create({ renderers });

  const items: RSSFeedItem[] = await Promise.all(
    posts
      .sort(
        (a, b) =>
          (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0),
      )
      .map(async (post) => {
        const { Content } = await render(post);
        const html = await container.renderToString(Content);

        return {
          link: `${getPostPath(post.id)}/`,
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

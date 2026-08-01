import { getCollection, render, type CollectionEntry } from 'astro:content';
import { getPostPath } from './post';
import { getPostDisplayTitle, getPostExcerpt } from './post';

export type PostEntry = CollectionEntry<'post'>;

export const showDraftsAtBuild =
  import.meta.env.DEV || import.meta.env.SHOW_PROTOTYPES === 'true';

export const byPubDateDesc = <T extends { data: PostEntry['data'] }>(
  left: T,
  right: T,
) => (right.data.pubDate?.getTime() ?? 0) - (left.data.pubDate?.getTime() ?? 0);

export const getSitePosts = async (
  filter: (post: PostEntry) => boolean = () => true,
) =>
  getCollection(
    'post',
    (post) => (showDraftsAtBuild || post.data.draft !== true) && filter(post),
  );

export const renderFeedPosts = async (posts: PostEntry[]) =>
  Promise.all(
    posts.map(async (post) => ({
      id: post.id,
      url: getPostPath(post.id),
      data: post.data,
      Content: (await render(post)).Content,
    })),
  );

/** 只供本地检查相关文章样式；不写入内容数据，也不会进入生产构建。 */
const devRelatedPreviewIds = new Set([
  'a-chuni-manifesto',
  'do-cloud-gamers-dream-of-electric-sheep',
  'misunderstandings-are-fine',
  'use-your-illusion',
]);

const getRelatedCollections = (post: PostEntry) => {
  const collections = post.data.collections ?? [];
  if (collections.length > 0 || !import.meta.env.DEV) return collections;
  return devRelatedPreviewIds.has(post.id) ? ['__dev_related_preview__'] : [];
};

export const findRelatedPosts = (post: PostEntry, posts: PostEntry[]) => {
  const collections = new Set(getRelatedCollections(post));
  return posts
    .filter(
      (candidate) => candidate.id !== post.id && candidate.data.draft !== true,
    )
    .map((candidate) => ({
      candidate,
      score: getRelatedCollections(candidate).filter((name) =>
        collections.has(name),
      ).length,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        byPubDateDesc(left.candidate, right.candidate),
    )
    .filter(({ score }) => score > 0)
    .slice(0, 3)
    .map(({ candidate }) => ({
      title: getPostDisplayTitle(candidate.data),
      id: candidate.id,
      kind: candidate.data.kind,
      description: getPostExcerpt(candidate.body),
      pubDate: candidate.data.pubDate,
      collections:
        candidate.data.collections ??
        (import.meta.env.DEV && devRelatedPreviewIds.has(candidate.id)
          ? ['本地预览']
          : []),
    }));
};

export const groupPostThreads = <T extends { data: PostEntry['data'] }>(
  posts: T[],
) => {
  const seenThreads = new Set<string>();
  const groups: Array<{ thread?: string; items: T[] }> = [];

  posts.forEach((post) => {
    const thread = post.data.thread;
    if (!thread) {
      groups.push({ items: [post] });
      return;
    }
    if (seenThreads.has(thread)) return;
    seenThreads.add(thread);
    groups.push({
      thread,
      items: posts
        .filter((candidate) => candidate.data.thread === thread)
        .sort(
          (left, right) =>
            (left.data.pubDate?.getTime() ?? 0) -
            (right.data.pubDate?.getTime() ?? 0),
        ),
    });
  });

  return groups;
};

export const getLatestPostGroups = async () =>
  groupPostThreads(
    (await getSitePosts(({ data }) => data.hiddenFromLatest !== true)).sort(
      (left, right) =>
        Number(right.data.pinned ?? false) -
          Number(left.data.pinned ?? false) || byPubDateDesc(left, right),
    ),
  );

export const getFeaturedPostGroups = async () =>
  groupPostThreads(
    (await getSitePosts(({ data }) => data.featured === true)).sort(
      byPubDateDesc,
    ),
  );

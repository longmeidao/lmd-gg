import slateConfig from '~@/slate.config';

/** 合集 slug 优先使用显式映射，否则自动规范化并保留非拉丁字符。 */
const slugMap: Record<string, string> = slateConfig.collectionSlugs ?? {};

const autoSlug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[\s_/\\]+/g, '-')
    // 标点作为分隔符，非拉丁文字保留。
    .replace(/[!-,.-@[-`{-~、-〜！-＠［-｀｛-～]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

export const getCollectionSlug = (name: string) =>
  slugMap[name] ?? (autoSlug(name) || encodeURIComponent(name.trim()));

/** 未指定合集时的展示兜底值，不写入 frontmatter。 */
export const DEFAULT_COLLECTION = '未分类';

/** 返回条目合集；空值使用默认合集。 */
export const getPostCollections = (data: { collections?: string[] }) => {
  const names = (data.collections ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : [DEFAULT_COLLECTION];
};

export const getCollectionHref = (name: string) =>
  `/${getCollectionSlug(name)}`;

/** 汇总合集，并按条目数降序、名称升序排列。 */
export const buildCollectionIndex = <
  T extends { data: { collections?: string[] } },
>(
  posts: T[],
) => {
  const grouped = new Map<string, T[]>();
  posts.forEach((post) => {
    getPostCollections(post.data).forEach((name) => {
      const bucket = grouped.get(name);
      if (bucket) bucket.push(post);
      else grouped.set(name, [post]);
    });
  });

  return [...grouped.entries()]
    .map(([name, items]) => ({
      name,
      slug: getCollectionSlug(name),
      href: getCollectionHref(name),
      count: items.length,
      items,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, 'zh-CN'),
    );
};

import slateConfig from '~@/slate.config';

/**
 * 合集（collection）—— 一组内容的集合，有自己的页面 `/<slug>`。
 *
 * 合集名是中文的时候没法自动推出拉丁 slug，所以 slug 的来源分两级：
 *  1. `slate.config.ts` 里的 `collectionSlugs` 显式映射（想要 `/city-walks` 这种就写在这里）
 *  2. 没写映射时按名字自动生成：拉丁字符转 kebab-case，其余原样保留
 *     （`/原型` 这种地址栏里显示是可读的，只在传输时才百分号编码）
 */
const slugMap: Record<string, string> = slateConfig.collectionSlugs ?? {};

const autoSlug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[\s_/\\]+/g, '-')
    // 半角/全角标点一律当分隔符，CJK、假名、谚文等保留
    .replace(/[!-,.-@[-`{-~、-〜！-＠［-｀｛-～]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

export const getCollectionSlug = (name: string) =>
  slugMap[name] ?? (autoSlug(name) || encodeURIComponent(name.trim()));

/**
 * 没写 collections 的条目归到这个默认合集。
 * 只在展示和筛选时兜底，**不会写进 md** —— frontmatter 里该缺就缺。
 */
export const DEFAULT_COLLECTION = '未分类';

/** 条目所属的合集；一个都没有就落到默认合集 */
export const getPostCollections = (data: { collections?: string[] }) => {
  const names = (data.collections ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : [DEFAULT_COLLECTION];
};

export const getCollectionHref = (name: string) =>
  `/${getCollectionSlug(name)}`;

/** 把全站条目汇总成合集列表，按条目数降序、同数按名字排 */
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

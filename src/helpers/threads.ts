/**
 * 串文分组：组的位置跟着组里第一条（输入需新到旧），组内按时间正序。
 * 服务端（helpers/content）和归档页前端补画的草稿共用同一套规则。
 */
export const groupThreads = <T>(
  items: T[],
  threadOf: (item: T) => string | undefined,
  sortAsc: (left: T, right: T) => number,
): Array<{ thread?: string; items: T[] }> => {
  const seen = new Set<string>();
  const groups: Array<{ thread?: string; items: T[] }> = [];
  items.forEach((item) => {
    const thread = threadOf(item);
    if (!thread) {
      groups.push({ items: [item] });
      return;
    }
    if (seen.has(thread)) return;
    seen.add(thread);
    groups.push({
      thread,
      items: items
        .filter((candidate) => threadOf(candidate) === thread)
        .sort(sortAsc),
    });
  });
  return groups;
};

/** 折叠串文前文：只折 1 条不划算——按钮占的地方跟内容差不多，2 条起才折 */
export const THREAD_COLLAPSE_FROM = 2;

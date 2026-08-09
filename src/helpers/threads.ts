/** 串文按首条位置分组，组内按时间正序排列。 */
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

/** 至少两条上下文时才折叠。 */
export const THREAD_COLLAPSE_FROM = 2;

import type { Root } from 'mdast';

/**
 * 给「整段被括号包住」的强调加上 `em-aside` 类。
 *
 * 起因是想让强调的缩小字号只作用于 `*（补充说明）*` 这种旁注，而不是所有
 * `*强调*`。CSS 没法按文本内容选元素（`:has()` 匹配元素不匹配文字，
 * `:contains()` 也从来没进过标准），所以只能落到 class 上——但判断可以放到
 * 构建时做，写作时照旧用 `*（…）*`，不必手写 HTML。
 *
 * 全角「（）」和半角 `()` 都认，中英混排里两种都会出现。
 */
const WRAPPED = /^\s*[（(][\s\S]*[）)]\s*$/;

interface EmphasisNode {
  type: string;
  value?: string;
  children?: EmphasisNode[];
  data?: { hProperties?: Record<string, unknown> };
}

/** 取节点下的纯文本，用来判断首尾是不是括号 */
const textOf = (node: EmphasisNode): string =>
  node.value ?? (node.children ?? []).map(textOf).join('');

const visit = (node: EmphasisNode, onEmphasis: (n: EmphasisNode) => void) => {
  if (node.type === 'emphasis') onEmphasis(node);
  (node.children ?? []).forEach((child) => visit(child, onEmphasis));
};

export default function remarkParentheticalEmphasis() {
  return (tree: Root) => {
    visit(tree as unknown as EmphasisNode, (node) => {
      if (!WRAPPED.test(textOf(node))) return;
      node.data ??= {};
      node.data.hProperties ??= {};
      const existing = node.data.hProperties.className;
      node.data.hProperties.className = Array.isArray(existing)
        ? [...existing, 'em-aside']
        : 'em-aside';
    });
  };
}

import type { Root } from 'mdast';

/** 为整段带全角或半角括号的强调添加 `em-aside` 类。 */
const WRAPPED = /^\s*[（(][\s\S]*[）)]\s*$/;

interface EmphasisNode {
  type: string;
  value?: string;
  children?: EmphasisNode[];
  data?: { hProperties?: Record<string, unknown> };
}

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

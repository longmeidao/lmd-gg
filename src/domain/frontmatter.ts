/** Worker、浏览器和开发插件共用的纯 TypeScript frontmatter 工具。 */

/** 拆分 frontmatter 与正文；格式无效时返回 null。 */
export const splitFrontmatter = (content: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return null;
  return { lines: match[1]!.split('\n'), body: match[2]! };
};

/** 移除 YAML 标量两侧的引号。 */
export const unquote = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return String(JSON.parse(trimmed));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
};

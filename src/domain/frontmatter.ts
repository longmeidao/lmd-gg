/**
 * frontmatter 的拆解与标量解析。
 *
 * 三个运行环境共用：生产 Worker（content-contract）、浏览器撰写与条目管理
 * （writer/frontmatter、post-actions）、本地 dev 插件。必须是纯 TS。
 */

/** 拆开 frontmatter 与正文；识别不了返回 null */
export const splitFrontmatter = (content: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return null;
  return { lines: match[1]!.split('\n'), body: match[2]! };
};

/** YAML 标量去引号：`"x"` / `'x'` 都剥掉外壳 */
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

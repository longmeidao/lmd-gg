/*
 * 「最后修改」时间。
 *
 * 取的不是文件的最后一次提交，而是**最后一次正文真的变了**的提交。
 * 因为一次批量整理（删 frontmatter 里的 tags/description、清行尾空白、
 * 把 `_强调_` 换成 `*强调*`）会把每篇文章的提交时间全推到同一天，
 * 而读者看到的内容一个字都没变。
 *
 * 判定方式：从新到旧遍历这个文件的提交，把每个版本的正文（frontmatter 之外
 * 的部分）按行去掉行尾空白后比较，第一处真有差异的提交就是答案。
 */
import { execSync } from 'node:child_process';

interface VFileLike {
  history: string[];
  data: { astro: { frontmatter: Record<string, unknown> } };
}

/** 一次构建里同一个文件会被处理多次，结果缓存下来 */
const cache = new Map<string, string>();

/** 往回追多少个提交就放弃 —— 正常文章不会有这么长的历史 */
const MAX_COMMITS = 80;

const git = (args: string[]): string | null => {
  try {
    return execSync(`git ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};

/** 去掉 frontmatter，只留正文 */
const bodyOf = (source: string): string => {
  if (!source.startsWith('---')) return source;
  const close = source.indexOf('\n---', 3);
  if (close < 0) return source;
  const afterFence = source.indexOf('\n', close + 1);
  return afterFence < 0 ? '' : source.slice(afterFence + 1);
};

/** 行尾空白和首尾空行不算内容改动 */
const normalize = (source: string): string =>
  bodyOf(source)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();

const lastContentChange = (filepath: string): string | null => {
  const log = git(['log', `-${MAX_COMMITS}`, '--format=%H%x09%cI', '--', `"${filepath}"`]);
  if (!log) return null;

  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date] = line.split('\t');
      return { hash, date };
    });
  if (commits.length === 0) return null;

  // git show 要的是相对仓库根的路径
  const root = git(['rev-parse', '--show-toplevel'])?.trim();
  const relative =
    root && filepath.startsWith(root) ? filepath.slice(root.length + 1) : filepath;

  for (const { hash, date } of commits) {
    const after = git(['show', `${hash}:"${relative}"`]);
    // 读不出来（改过名、浅克隆等）就别猜，按这个提交算
    if (after === null) return date;
    const before = git(['show', `${hash}~1:"${relative}"`]);
    // 没有父版本 = 这次提交新建了文件，算内容变更
    if (before === null) return date;
    if (normalize(after) !== normalize(before)) return date;
  }

  // 追到头都只是格式改动，退回最早那次
  return commits.at(-1)?.date ?? null;
};

export function remarkModifiedTime() {
  return function (_tree: unknown, file: VFileLike) {
    const filepath = file.history[0];
    if (!filepath) return;

    let stamp = cache.get(filepath);
    if (stamp === undefined) {
      stamp =
        lastContentChange(filepath) ??
        git(['log', '-1', '--format=%cI', '--', `"${filepath}"`])?.trim() ??
        '';
      cache.set(filepath, stamp);
    }
    file.data.astro.frontmatter.lastModified = stamp;
  };
}

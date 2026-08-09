/**
 * 返回正文最后发生语义变化的提交时间。
 * frontmatter、行尾空白和首尾空行的变化不计入正文修改。
 */
import { execSync } from 'node:child_process';

interface VFileLike {
  history: string[];
  data: { astro: { frontmatter: Record<string, unknown> } };
}

/** 在单次构建中复用同一文件的结果。 */
const cache = new Map<string, string>();

/** 最多检查的历史提交数。 */
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

const bodyOf = (source: string): string => {
  if (!source.startsWith('---')) return source;
  const close = source.indexOf('\n---', 3);
  if (close < 0) return source;
  const afterFence = source.indexOf('\n', close + 1);
  return afterFence < 0 ? '' : source.slice(afterFence + 1);
};

const normalize = (source: string): string =>
  bodyOf(source)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();

const lastContentChange = (filepath: string): string | null => {
  const log = git([
    'log',
    `-${MAX_COMMITS}`,
    '--format=%H%x09%cI',
    '--',
    `"${filepath}"`,
  ]);
  if (!log) return null;

  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date] = line.split('\t');
      return { hash, date };
    });
  if (commits.length === 0) return null;

  // git show 使用仓库根目录的相对路径。
  const root = git(['rev-parse', '--show-toplevel'])?.trim();
  const relative =
    root && filepath.startsWith(root)
      ? filepath.slice(root.length + 1)
      : filepath;

  for (const { hash, date } of commits) {
    const after = git(['show', `${hash}:"${relative}"`]);
    // 无法读取父版本时，使用当前提交时间。
    if (after === null) return date;
    const before = git(['show', `${hash}~1:"${relative}"`]);
    // 没有父版本表示文件在当前提交创建。
    if (before === null) return date;
    if (normalize(after) !== normalize(before)) return date;
  }

  // 仅发现格式变化时，使用最早可用的提交。
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

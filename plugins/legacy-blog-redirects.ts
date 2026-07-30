import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { AstroIntegration } from 'astro';

const CONTENT_DIR = 'src/content/post';

/** 只取 frontmatter 里的 kind 和 draft，不引入 YAML 依赖 */
const readFrontmatter = async (file: string) => {
  const raw = await readFile(file, 'utf8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return {
    kind: fm.match(/^kind:\s*(\S+)\s*$/m)?.[1] ?? 'article',
    draft: /^draft:\s*true\s*$/m.test(fm),
  };
};

const walk = async (dir: string, base = dir): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full, base);
      if (!/\.mdx?$/.test(entry.name)) return [];
      return [path.relative(base, full).replace(/\.mdx?$/, '')];
    }),
  );
  return files.flat();
};

/**
 * 条目地址从 `/blog/<slug>` 换成了无前缀的 `/<slug>`，旧地址已经被搜索引擎收录过，
 * 所以构建完往 dist 里写一份 Netlify `_redirects`，给出真正的 301。
 * （Astro 自带的 redirects 在静态输出下只会生成 meta refresh 页面，对 SEO 更弱。）
 */
export function legacyBlogRedirects(): AstroIntegration {
  return {
    name: 'lmd-legacy-blog-redirects',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const contentDir = path.resolve(process.cwd(), CONTENT_DIR);
        const slugs = await walk(contentDir);
        const entries = await Promise.all(
          slugs.map(async (slug) => {
            const { draft } = await readFrontmatter(
              path.join(contentDir, `${slug}.md`),
            ).catch(() => ({ draft: true }));
            const id = slug.split(path.sep).join('/');
            // 草稿在生产构建里没有页面，301 到 404 比直接 404 更糟
            return draft ? null : `/blog/${id} /${id} 301`;
          }),
        );
        const lines = entries.filter((line): line is string => line !== null);

        const outFile = new URL('_redirects', dir);
        // 已经有 _redirects 的话追加，不要覆盖别人写的规则
        let existing = '';
        try {
          await access(outFile);
          existing = `${(await readFile(outFile, 'utf8')).trimEnd()}\n`;
        } catch {
          /* 还没有这个文件 */
        }

        await writeFile(
          outFile,
          `${existing}${lines.sort().join('\n')}\n`,
          'utf8',
        );
        logger.info(`wrote ${lines.length} legacy /blog/* redirects`);
      },
    },
  };
}

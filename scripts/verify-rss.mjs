import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const contentDirectory = path.resolve('src/content/post');
const rssPath = path.join(outputDirectory, 'rss.xml');
const rss = await readFile(rssPath, 'utf8');
const itemLinks = Array.from(
  rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g),
  (match) => match[1],
);

if (itemLinks.length === 0) {
  throw new Error('RSS validation failed: no item links were generated.');
}

async function getMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return getMarkdownFiles(entryPath);
      return /\.(md|mdx)$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

function readFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? '';
}

const expectedFeaturedIds = new Set();
for (const filePath of await getMarkdownFiles(contentDirectory)) {
  const source = await readFile(filePath, 'utf8');
  const frontmatter = readFrontmatter(source);
  const isDraft = /^draft:\s*true\s*$/m.test(frontmatter);
  const isFeatured = /^featured:\s*true\s*$/m.test(frontmatter);

  if (!isDraft && isFeatured) {
    expectedFeaturedIds.add(
      path
        .relative(contentDirectory, filePath)
        .replaceAll(path.sep, '/')
        .replace(/\.(md|mdx)$/, ''),
    );
  }
}

const rssFeaturedIds = new Set();
for (const link of itemLinks) {
  const url = new URL(link);

  if (url.pathname.split('/').some((part) => part === 'undefined')) {
    throw new Error(`RSS validation failed: invalid item URL ${link}`);
  }
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    throw new Error(
      `RSS validation failed: item URL is not canonical (unexpected trailing slash): ${link}`,
    );
  }

  const pagePath = path.join(
    outputDirectory,
    url.pathname.replace(/^\//, ''),
    'index.html',
  );

  try {
    await access(pagePath);
  } catch {
    throw new Error(
      `RSS validation failed: ${link} has no generated page at ${pagePath}`,
    );
  }

  // 条目地址无前缀，直接就是 /<slug>
  const id = decodeURIComponent(url.pathname)
    .replace(/^\//, '')
    .replace(/\/$/, '');
  rssFeaturedIds.add(id);
  if (!expectedFeaturedIds.has(id)) {
    throw new Error(
      `RSS validation failed: ${link} is not a published featured item.`,
    );
  }
}

const missingFeaturedIds = [...expectedFeaturedIds].filter(
  (id) => !rssFeaturedIds.has(id),
);
if (missingFeaturedIds.length > 0) {
  throw new Error(
    `RSS validation failed: missing featured items: ${missingFeaturedIds.join(', ')}`,
  );
}

console.log(`Validated ${itemLinks.length} featured RSS item links.`);

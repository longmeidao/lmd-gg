import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const rssPath = path.join(outputDirectory, 'rss.xml');
const rss = await readFile(rssPath, 'utf8');
const itemLinks = Array.from(
  rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g),
  (match) => match[1],
);

if (itemLinks.length === 0) {
  throw new Error('RSS validation failed: no item links were generated.');
}

for (const link of itemLinks) {
  const url = new URL(link);

  if (url.pathname.split('/').some((part) => part === 'undefined')) {
    throw new Error(`RSS validation failed: invalid item URL ${link}`);
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
}

console.log(`Validated ${itemLinks.length} RSS item links.`);

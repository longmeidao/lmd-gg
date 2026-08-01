import type { Visibility, WriterItem } from './model';

export const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 72);

export const generatedSlug = (
  item: WriterItem,
  index: number,
  customSlug: string,
) => {
  if (index === 0 && customSlug) return slugify(customSlug);
  const fromTitle = slugify(item.title);
  if (fromTitle) return index === 0 ? fromTitle : `${fromTitle}-${index + 1}`;
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  return `${item.kind}-${stamp}-${index + 1}`;
};

interface MarkdownOptions {
  collections: string[];
  visibility: Visibility;
  pubDate: string;
  today: string;
  threadId?: string;
}

export const markdownFor = (item: WriterItem, options: MarkdownOptions) => {
  const kind =
    item.kind === 'note' && item.showTitle && item.title.trim()
      ? 'article'
      : item.kind;
  const primaryBody =
    item.kind === 'quote'
      ? item.body
          .trim()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      : item.body.trim();
  const body =
    item.kind === 'link'
      ? ''
      : [primaryBody, item.attachedText.trim()]
          .filter(Boolean)
          .join('\n\n---\n\n');
  const yamlString = (value: string) => JSON.stringify(value);
  const frontmatter = [
    item.title.trim() ? `title: ${yamlString(item.title.trim())}` : '',
    item.kind !== 'link' && item.attachedText.trim() ? 'attached: true' : '',
    `kind: ${kind}`,
    item.externalUrl.trim()
      ? `externalUrl: ${yamlString(item.externalUrl.trim())}`
      : '',
    item.source.trim() ? `source: ${yamlString(item.source.trim())}` : '',
    item.commentary.trim()
      ? `commentary: ${yamlString(item.commentary.trim())}`
      : '',
    options.threadId ? `thread: ${yamlString(options.threadId)}` : '',
    item.rating ? `rating: ${Number(item.rating)}` : '',
    options.collections.length
      ? `collections: ${JSON.stringify(options.collections)}`
      : '',
    options.visibility === 'hidden' ? 'hiddenFromLatest: true' : '',
    options.visibility === 'private'
      ? 'draft: true'
      : `pubDate: ${options.pubDate || options.today}`,
  ].filter(Boolean);
  return `---\n${frontmatter.join('\n')}\n---\n\n${body}${body ? '\n' : ''}`;
};

import { splitFrontmatter, unquote } from '@/domain/frontmatter';
import { blankWriterItem, type Visibility, type WriterKind } from './model';

export const parseExistingPost = (content: string, today: string) => {
  const parts = splitFrontmatter(content);
  if (!parts) throw new Error('这篇内容的 Frontmatter 无法识别。');
  const frontmatter = new Map<string, string>();
  const blockTags: string[] = [];
  let readingTags = false;
  for (const line of parts.lines) {
    if (line.trim() === 'collections:') {
      readingTags = true;
      continue;
    }
    if (readingTags) {
      const tag = line.match(/^\s*-\s+(.+)$/);
      if (tag) {
        blockTags.push(unquote(tag[1]!));
        continue;
      }
      readingTags = false;
    }
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) frontmatter.set(field[1]!, unquote(field[2]!));
  }
  const kind = (frontmatter.get('kind') || 'article') as WriterKind | 'article';
  let parsedCollections: string[] = [];
  if (blockTags.length > 0) {
    parsedCollections = blockTags;
  } else {
    try {
      parsedCollections = JSON.parse(
        frontmatter.get('collections') || '[]',
      ) as string[];
    } catch {
      parsedCollections = [];
    }
  }
  const existingBody = parts.body.trim();
  const normalizedBody =
    kind === 'quote'
      ? existingBody.replace(/^>\s?/gm, '')
      : kind === 'link'
        ? ''
        : existingBody;
  const normalizedCommentary =
    kind === 'link' && existingBody
      ? [existingBody, frontmatter.get('commentary') || '']
          .filter(Boolean)
          .join('\n\n')
      : frontmatter.get('commentary') || '';

  return {
    item: {
      ...blankWriterItem(kind === 'article' ? 'note' : kind),
      title: frontmatter.get('title') || '',
      body: normalizedBody,
      externalUrl: frontmatter.get('externalUrl') || '',
      source: frontmatter.get('source') || '',
      commentary: normalizedCommentary,
      rating: frontmatter.get('rating') || '',
      showTitle: kind === 'article',
    },
    collections: parsedCollections,
    visibility:
      frontmatter.get('draft') === 'true'
        ? ('private' as Visibility)
        : frontmatter.get('hiddenFromLatest') === 'true'
          ? ('hidden' as Visibility)
          : ('public' as Visibility),
    pubDate: (frontmatter.get('pubDate') || today).slice(0, 10),
    thread: frontmatter.get('thread') || '',
  };
};

export const setPostThread = (content: string, threadId: string) => {
  const parts = splitFrontmatter(content);
  if (!parts) throw new Error('这篇内容的 Frontmatter 无法识别。');
  const lines = parts.lines.filter((line) => !/^thread:/.test(line));
  lines.push(`thread: ${JSON.stringify(threadId)}`);
  return `---\n${lines.join('\n')}\n---\n\n${parts.body.replace(/^\n+/, '')}`;
};

export type ParsedPost = ReturnType<typeof parseExistingPost>;

import { splitFrontmatter, unquote } from './frontmatter';

export const CONTENT_DIR = 'src/content/post';
export const MAX_POST_BYTES = 256 * 1024;
export const MAX_THREAD_ITEMS = 24;
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export interface WriteItem {
  slug: string;
  content: string;
  operation?: 'create' | 'update';
}

export interface WritePayload {
  slug?: unknown;
  content?: unknown;
  posts?: unknown;
}

export interface DraftSummary {
  slug: string;
  title: string;
  kind: string;
  pubDate: string;
  collections: string[];
  /** 串文的键名，没有就是空串。归档页靠它把草稿串成一组，不只是判断有没有 */
  thread: string;
  featured: boolean;
  hiddenFromLatest: boolean;
  /**
   * 正文和这几个展示用字段，是为了让归档页能把草稿按正常 feed 条目渲染出来。
   * 草稿不进静态构建（否则谁都能读），所以只能由已鉴权的接口带回来，
   * 前端拿 scripts/writer/markdown.ts 那套渲染器画出来。
   */
  body: string;
  externalUrl: string;
  source: string;
  commentary: string;
  rating: number;
}

export const postRelativePath = (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) throw new Error('INVALID_SLUG');
  return `${CONTENT_DIR}/${slug}.md`;
};

/** 校验失败的错误码，Worker 和 dev 插件据此映射到 400 */
export const INVALID_PAYLOAD_ERRORS = [
  'INVALID_SLUG',
  'INVALID_CONTENT',
  'INVALID_ITEM_COUNT',
  'INVALID_OPERATION',
  'DUPLICATE_SLUG',
] as const;

export const readWriteItems = (payload: WritePayload): WriteItem[] => {
  const legacy =
    typeof payload.slug === 'string' && typeof payload.content === 'string'
      ? [{ slug: payload.slug.trim(), content: payload.content }]
      : [];
  const items = Array.isArray(payload.posts)
    ? payload.posts
        .filter(
          (item): item is WriteItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as WriteItem).slug === 'string' &&
            typeof (item as WriteItem).content === 'string',
        )
        .map((item) => {
          const operation = (item as WriteItem).operation;
          if (
            operation !== undefined &&
            operation !== 'create' &&
            operation !== 'update'
          ) {
            throw new Error('INVALID_OPERATION');
          }
          return {
            slug: item.slug.trim(),
            content: item.content,
            ...(operation ? { operation } : {}),
          };
        })
    : legacy;

  if (items.length === 0 || items.length > MAX_THREAD_ITEMS) {
    throw new Error('INVALID_ITEM_COUNT');
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (!SLUG_PATTERN.test(item.slug)) throw new Error('INVALID_SLUG');
    if (!item.content.startsWith('---\n')) throw new Error('INVALID_CONTENT');
    if (new TextEncoder().encode(item.content).byteLength > MAX_POST_BYTES) {
      throw new Error('INVALID_CONTENT');
    }
    if (seen.has(item.slug)) throw new Error('DUPLICATE_SLUG');
    seen.add(item.slug);
  }
  return items;
};

const lineValue = (lines: string[], name: string) => {
  for (const line of lines) {
    const match = new RegExp(`^${name}:\\s*(.*?)\\s*$`).exec(line);
    if (match) return match[1]!;
  }
  return '';
};

export const parseDraftSummary = (
  slug: string,
  content: string,
): DraftSummary | null => {
  const parts = splitFrontmatter(content);
  if (!parts) return null;
  const value = (name: string) => lineValue(parts.lines, name);
  if (value('draft') !== 'true') return null;
  const body = parts.body.replace(/^\s+/, '');

  let collections: string[] = [];
  const rawCollections = value('collections');
  if (rawCollections.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawCollections) as unknown;
      if (Array.isArray(parsed)) {
        collections = parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      collections = [];
    }
  }

  return {
    slug,
    title: unquote(value('title')),
    kind: unquote(value('kind')) || 'article',
    pubDate: unquote(value('pubDate')),
    collections,
    thread: unquote(value('thread')),
    featured: value('featured') === 'true',
    hiddenFromLatest: value('hiddenFromLatest') === 'true',
    body,
    externalUrl: unquote(value('externalUrl')),
    source: unquote(value('source')),
    commentary: unquote(value('commentary')),
    rating: Number(value('rating')) || 0,
  };
};

export const makeUploadName = (rawName: string, now = new Date()) => {
  const safeBase =
    rawName
      .split(/[\\/]/)
      .pop()!
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'file';
  const dot = safeBase.lastIndexOf('.');
  const extension = dot > 0 ? safeBase.slice(dot) : '';
  const stem = (dot > 0 ? safeBase.slice(0, dot) : safeBase) || 'file';
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${stamp}-${stem}-${suffix}${extension}`;
};

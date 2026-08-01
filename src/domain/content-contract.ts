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
  thread: boolean;
  featured: boolean;
  hiddenFromLatest: boolean;
}

export const postRelativePath = (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) throw new Error('INVALID_SLUG');
  return `${CONTENT_DIR}/${slug}.md`;
};

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

const frontmatterValue = (frontmatter: string, name: string) =>
  new RegExp(`^${name}:\\s*(.*?)\\s*$`, 'm').exec(frontmatter)?.[1] ?? '';

const unquote = (value: string) => {
  if (!value) return '';
  if (value.startsWith('"')) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value.slice(1, -1);
    }
  }
  return value.replace(/^['"]|['"]$/g, '');
};

export const parseDraftSummary = (
  slug: string,
  content: string,
): DraftSummary | null => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  if (!frontmatter || frontmatterValue(frontmatter, 'draft') !== 'true') {
    return null;
  }

  let collections: string[] = [];
  const rawCollections = frontmatterValue(frontmatter, 'collections');
  if (rawCollections.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawCollections) as unknown;
      if (Array.isArray(parsed)) {
        collections = parsed.filter(
          (value): value is string => typeof value === 'string',
        );
      }
    } catch {
      collections = [];
    }
  }

  return {
    slug,
    title: unquote(frontmatterValue(frontmatter, 'title')),
    kind: unquote(frontmatterValue(frontmatter, 'kind')) || 'article',
    pubDate: unquote(frontmatterValue(frontmatter, 'pubDate')),
    collections,
    thread: Boolean(frontmatterValue(frontmatter, 'thread')),
    featured: frontmatterValue(frontmatter, 'featured') === 'true',
    hiddenFromLatest:
      frontmatterValue(frontmatter, 'hiddenFromLatest') === 'true',
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

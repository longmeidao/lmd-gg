export type PostKind = 'article' | 'note' | 'quote' | 'link' | 'photo';

interface PostPresentationData {
  title?: string;
  kind: PostKind;
  source?: string;
  externalUrl?: string;
}

/**
 * 条目地址就是 `/<slug>`，没有任何前缀（原来是 `/blog/<slug>`）。
 * 合集页也在根下，两者共用 src/pages/[...slug].astro 这一个 slug 空间。
 * slug 里可能带目录（`prototype/short-note`），所以路由用 rest 参数。
 */
export const getPostPath = (id: string) => `/${id}`;

/** 展示用域名：去掉协议和 www 前缀 */
export const formatDisplayDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0] ?? value;
  }
};

export const getPostDisplayTitle = (data: PostPresentationData) => {
  if (data.title?.trim()) return data.title.trim();
  if (data.kind === 'quote') {
    return data.source ? `摘自 ${data.source}` : '引文';
  }
  if (data.kind === 'note') return '随记';
  if (data.kind === 'photo') return '图片';
  if (data.kind === 'link' && data.externalUrl) {
    return formatDisplayDomain(data.externalUrl);
  }
  return '未命名文章';
};

export const getPostExcerpt = (body: string | undefined, maxLength = 180) => {
  const paragraph = (body ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(
      (part) =>
        part &&
        !part.startsWith('#') &&
        !part.startsWith('![') &&
        !part.startsWith('```') &&
        !part.startsWith(':::') &&
        part !== '---',
    );

  if (!paragraph) return undefined;

  const plainText = paragraph
    .replace(/^>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) return undefined;
  return plainText.length > maxLength
    ? `${plainText.slice(0, maxLength).trimEnd()}…`
    : plainText;
};

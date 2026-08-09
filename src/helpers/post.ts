export type PostKind = 'article' | 'note' | 'quote' | 'link' | 'photo';

interface PostPresentationData {
  title?: string;
  kind: PostKind;
  source?: string;
  externalUrl?: string;
}

/** 条目和合集共用根级 slug 空间，条目 id 可以包含子目录。 */
export const getPostPath = (id: string) => `/${id}`;

/** 返回不含协议和 www 前缀的展示域名。 */
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

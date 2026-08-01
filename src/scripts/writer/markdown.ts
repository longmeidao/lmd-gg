export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const escapeAttribute = escapeHtml;

export const formatDisplayDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0] ?? value;
  }
};

export const inlineMarkdown = (value: string) =>
  escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>');

export const markdownBlocks = (value: string) =>
  value
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      if (/^!\[.*\]\(https?:\/\/.+\)$/.test(block.trim())) {
        const match = block.trim().match(/^!\[(.*)\]\((https?:\/\/.+)\)$/);
        return match
          ? `<figure><img src="${escapeAttribute(match[2]!)}" alt="${escapeAttribute(match[1]!)}" /></figure>`
          : '';
      }
      if (block.startsWith('> ')) {
        return `<blockquote>${inlineMarkdown(block.replace(/^> ?/gm, ''))}</blockquote>`;
      }
      return `<p>${inlineMarkdown(block).replaceAll('\n', '<br />')}</p>`;
    })
    .join('');

export const stripDirectives = (value: string) =>
  value
    .split('\n')
    .filter((line) => !/^\s*:::/.test(line))
    .join('\n')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1*$2*');

import { formatDisplayDomain } from '@/helpers/post';
import { escapeAttribute, escapeHtml, markdownBlocks } from './markdown';
import type { WriterItem } from './model';

const noteFields = (item: WriterItem) => `
  ${
    item.showTitle
      ? `<input
          class="writer-title-input"
          data-field-name="title"
          aria-label="标题"
          placeholder="标题"
          value="${escapeAttribute(item.title)}"
        />`
      : ''
  }
  <textarea
    class="writer-main-textarea"
    data-field-name="body"
    aria-label="正文"
    placeholder="写点什么……"
  >${escapeHtml(item.body)}</textarea>
`;

const linkFields = (item: WriterItem) => `
  <label class="writer-url-row">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.6 13.4a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2m1.9 4.5a4.5 4.5 0 0 0-6.4 0l-2.1 2.1a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"></path>
    </svg>
    <input
      data-field-name="externalUrl"
      aria-label="链接地址"
      inputmode="url"
      placeholder="输入链接…"
      value="${escapeAttribute(item.externalUrl)}"
    />
  </label>
  <input
    class="writer-title-input"
    data-field-name="title"
    aria-label="链接标题"
    placeholder="链接标题"
    value="${escapeAttribute(item.title)}"
  />
  <textarea
    class="writer-commentary-textarea"
    data-field-name="commentary"
    aria-label="我的评论"
    placeholder="你的想法"
  >${escapeHtml(item.commentary)}</textarea>
`;

const quoteFields = (item: WriterItem) => `
  <div class="writer-quote-input">
    <span aria-hidden="true">“</span>
    <textarea
      data-field-name="body"
      aria-label="引文"
      placeholder="输入引文…"
    >${escapeHtml(item.body)}</textarea>
  </div>
  <label class="writer-quote-meta">
    <span aria-hidden="true">—</span>
    <input
      data-field-name="source"
      aria-label="作者"
      placeholder="作者"
      value="${escapeAttribute(item.source)}"
    />
  </label>
  <input
    class="writer-source-link"
    data-field-name="externalUrl"
    aria-label="来源链接"
    inputmode="url"
    placeholder="来源链接"
    value="${escapeAttribute(item.externalUrl)}"
  />
  <textarea
    class="writer-commentary-textarea"
    data-field-name="commentary"
    aria-label="我的评论"
    placeholder="你的想法"
  >${escapeHtml(item.commentary)}</textarea>
`;

/** 撰写形式只负责字段结构，入口脚本负责状态与事件。 */
export const renderWriterFields = (item: WriterItem) =>
  item.kind === 'note'
    ? noteFields(item)
    : item.kind === 'link'
      ? linkFields(item)
      : quoteFields(item);

/** 返回与正文 feed 同语言的轻量预览，不承担事件和 DOM 状态。 */
export const renderWriterPreview = (item: WriterItem, pubDate: string) => {
  const date = pubDate
    ? new Date(`${pubDate}T00:00:00`).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '发布时';
  const rating = item.rating
    ? `<span class="writer-preview-rating">${'★'.repeat(Number(item.rating))}${'☆'.repeat(5 - Number(item.rating))}</span>`
    : '';
  const footer = `<footer><span class="writer-preview-date">${date}</span>${rating}</footer>`;

  if (item.kind === 'link') {
    return `
      <div class="writer-preview-link">
        <div class="writer-preview-link-url">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 5h5v5M19 5l-9 9"></path>
            <path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"></path>
          </svg>
          <a href="${escapeAttribute(item.externalUrl || '#')}">${escapeHtml(formatDisplayDomain(item.externalUrl || 'https://example.com'))}</a>
        </div>
        <h2>${escapeHtml(item.title || '链接标题')}</h2>
      </div>
      ${markdownBlocks(item.commentary)}
      ${footer}
    `;
  }

  if (item.kind === 'quote') {
    return `
      <blockquote class="writer-preview-quote">
        <span aria-hidden="true">“</span>
        ${markdownBlocks(item.body || '引文会显示在这里。')}
        ${item.source ? `<cite>— ${escapeHtml(item.source)}</cite>` : ''}
        ${item.externalUrl ? `<a href="${escapeAttribute(item.externalUrl)}" aria-label="打开来源链接">↗</a>` : ''}
      </blockquote>
      ${markdownBlocks(item.commentary)}
      ${footer}
    `;
  }

  return `
    ${item.showTitle && item.title ? `<h1>${escapeHtml(item.title)}</h1>` : ''}
    ${markdownBlocks(item.body || '内容会实时显示在这里。')}
    ${footer}
  `;
};

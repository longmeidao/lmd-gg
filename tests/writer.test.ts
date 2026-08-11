import { describe, expect, it } from 'vitest';
import {
  parseExistingPost,
  setPostThread,
} from '../src/scripts/writer/frontmatter';
import { markdownFor } from '../src/scripts/writer/publish';
import {
  blankWriterItem,
  writerContentSnapshot,
} from '../src/scripts/writer/model';
import {
  renderWriterFields,
  renderWriterPreview,
} from '../src/scripts/writer/render';

describe('writer frontmatter', () => {
  it('tracks content changes without treating focus or generated ids as edits', () => {
    const item = { ...blankWriterItem(), body: '已发布内容' };
    const state = {
      items: [item],
      activeIndex: 0,
      collections: ['随记'],
      visibility: 'public' as const,
      pubDate: '2026-08-11',
      customSlug: 'published-note',
    };
    const published = writerContentSnapshot(state);

    expect(
      writerContentSnapshot({
        ...state,
        activeIndex: 1,
        items: [{ ...item, id: 'new-render-id' }],
      }),
    ).toBe(published);
    expect(
      writerContentSnapshot({
        ...state,
        items: [{ ...item, body: '发布后又修改' }],
      }),
    ).not.toBe(published);
  });

  it('round-trips a private article', () => {
    const item = {
      ...blankWriterItem(),
      title: '测试标题',
      body: '正文',
      showTitle: true,
    };
    const markdown = markdownFor(item, {
      collections: ['随记'],
      visibility: 'private',
      pubDate: '2026-08-01',
      today: '2026-08-01',
    });
    const parsed = parseExistingPost(markdown, '2026-08-01');

    expect(parsed.item.title).toBe('测试标题');
    expect(parsed.item.body).toBe('正文');
    expect(parsed.item.showTitle).toBe(true);
    expect(parsed.visibility).toBe('private');
    expect(parsed.collections).toEqual(['随记']);
  });

  it('adds or replaces a thread id without changing the body', () => {
    const source = '---\ntitle: "旧文"\nthread: "old"\n---\n\n正文';
    expect(setPostThread(source, 'thread-new')).toBe(
      '---\ntitle: "旧文"\nthread: "thread-new"\n---\n\n正文',
    );
  });

  it('renders balanced quote fields and escapes user content', () => {
    const item = {
      ...blankWriterItem('quote'),
      source: '<作者>',
      body: '引文',
    };
    const html = renderWriterFields(item);

    expect(html.match(/<label\b/g)).toHaveLength(1);
    expect(html.match(/<\/label>/g)).toHaveLength(1);
    expect(html).toContain('value="&lt;作者&gt;"');
  });

  it('renders a link preview without leaking raw attributes', () => {
    const item = {
      ...blankWriterItem('link'),
      title: '<链接>',
      externalUrl: 'https://example.com/?q="test"',
    };

    const html = renderWriterPreview(item, '2026-08-09');
    expect(html).toContain('&lt;链接&gt;');
    expect(html).toContain('q=&quot;test&quot;');
  });
});

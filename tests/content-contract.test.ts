import { describe, expect, it } from 'vitest';
import {
  makeUploadName,
  parseDraftSummary,
  postRelativePath,
  readWriteItems,
} from '../src/domain/content-contract';

describe('content contract', () => {
  it('accepts nested safe slugs and returns canonical paths', () => {
    expect(postRelativePath('prototype/short-note')).toBe(
      'src/content/post/prototype/short-note.md',
    );
    expect(() => postRelativePath('../secret')).toThrow('INVALID_SLUG');
  });

  it('rejects duplicate thread items', () => {
    expect(() =>
      readWriteItems({
        posts: [
          { slug: 'same', content: '---\npubDate: 2026-08-01\n---\n' },
          { slug: 'same', content: '---\npubDate: 2026-08-01\n---\n' },
        ],
      }),
    ).toThrow('DUPLICATE_SLUG');
  });

  it('preserves explicit mixed create and update operations', () => {
    expect(
      readWriteItems({
        posts: [
          {
            slug: 'new-reply',
            content: '---\npubDate: 2026-08-01\n---\n',
            operation: 'create',
          },
          {
            slug: 'reply-target',
            content: '---\npubDate: 2026-08-01\n---\n',
            operation: 'update',
          },
        ],
      }),
    ).toMatchObject([
      { slug: 'new-reply', operation: 'create' },
      { slug: 'reply-target', operation: 'update' },
    ]);
    expect(() =>
      readWriteItems({
        posts: [
          {
            slug: 'bad-operation',
            content: '---\npubDate: 2026-08-01\n---\n',
            operation: 'delete',
          },
        ],
      }),
    ).toThrow('INVALID_OPERATION');
  });

  it('only exposes draft metadata', () => {
    expect(
      parseDraftSummary(
        'draft-note',
        '---\ntitle: "草稿"\nkind: note\ndraft: true\ncollections: ["随记"]\n---\n\nsecret',
      ),
    ).toMatchObject({
      slug: 'draft-note',
      title: '草稿',
      kind: 'note',
      collections: ['随记'],
    });
    expect(
      parseDraftSummary(
        'public-note',
        '---\nkind: note\npubDate: 2026-08-01\n---\n',
      ),
    ).toBeNull();
  });

  it('adds a random suffix before the extension', () => {
    const first = makeUploadName('screen shot.png', new Date('2026-08-01'));
    const second = makeUploadName('screen shot.png', new Date('2026-08-01'));
    expect(first).toMatch(/^20260801T000000-screen-shot-[\da-f]{8}\.png$/);
    expect(second).not.toBe(first);
  });
});

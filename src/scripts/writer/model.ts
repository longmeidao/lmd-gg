export type WriterKind = 'note' | 'link' | 'quote';
export type Visibility = 'public' | 'hidden' | 'private';

export interface WriterItem {
  id: string;
  kind: WriterKind;
  title: string;
  body: string;
  externalUrl: string;
  source: string;
  commentary: string;
  attachedText: string;
  rating: string;
  showTitle: boolean;
  showRating: boolean;
}

export interface WriterState {
  items: WriterItem[];
  activeIndex: number;
  collections: string[];
  visibility: Visibility;
  pubDate: string;
  customSlug: string;
}

export interface StoredDraft extends WriterState {
  version: 2;
  /** 只有用户主动改过发布日期时，跨天恢复草稿才保留旧值。 */
  pubDateCustomized?: boolean;
}

export const restoredPublishDate = (draft: StoredDraft, today: string) =>
  draft.pubDateCustomized ? draft.pubDate || today : today;

export const writerContentSnapshot = (state: WriterState) =>
  JSON.stringify({
    items: state.items.map((item) => ({
      kind: item.kind,
      title: item.title,
      body: item.body,
      externalUrl: item.externalUrl,
      source: item.source,
      commentary: item.commentary,
      attachedText: item.attachedText,
      rating: item.rating,
      showTitle: item.showTitle,
      showRating: item.showRating,
    })),
    collections: state.collections,
    visibility: state.visibility,
    pubDate: state.pubDate,
    customSlug: state.customSlug,
  });

export const makeWriterId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const blankWriterItem = (kind: WriterKind = 'note'): WriterItem => ({
  id: makeWriterId(),
  kind,
  title: '',
  body: '',
  externalUrl: '',
  source: '',
  commentary: '',
  attachedText: '',
  rating: '',
  showTitle: false,
  showRating: false,
});

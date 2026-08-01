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
}

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

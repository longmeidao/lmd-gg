import Heti from 'heti/js/heti-addon.js';
import {
  blankWriterItem,
  makeWriterId,
  type StoredDraft,
  type Visibility,
  type WriterItem,
  type WriterKind,
  type WriterState,
  writerContentSnapshot,
} from './writer/model';
import {
  escapeAttribute,
  escapeHtml,
  markdownBlocks,
  stripDirectives,
} from './writer/markdown';
import { formatDisplayDomain } from '@/helpers/post';
import { askCollectionName } from './collection-dialog';
import { parseExistingPost, setPostThread } from './writer/frontmatter';
import {
  generatedSlug as makeGeneratedSlug,
  markdownFor as serializeMarkdown,
} from './writer/publish';
import { renderWriterFields, renderWriterPreview } from './writer/render';

const root = document.querySelector<HTMLElement>('[data-writer-root]');

if (root) {
  const $ = <T extends HTMLElement>(selector: string) => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Writer UI missing: ${selector}`);
    return element;
  };
  const writerWindow = $<HTMLElement>('[data-writer-window]');
  const form = $<HTMLFormElement>('[data-writer-form]');
  const itemsHost = $<HTMLElement>('[data-writer-items]');
  const workspace = $<HTMLElement>('.writer-workspace');
  const previewPane = $<HTMLElement>('[data-preview-pane]');
  const preview = $<HTMLElement>('[data-writer-preview]');
  const status = $<HTMLElement>('[data-writer-status]');
  const publishButton = $<HTMLButtonElement>('[data-writer-publish]');
  const addThreadButton = $<HTMLButtonElement>('[data-add-thread]');
  const headerFormats = $<HTMLElement>('[data-header-formats]');
  const threadHeading = $<HTMLElement>('[data-thread-heading]');
  const collectionTrigger = $<HTMLButtonElement>('[data-collection-trigger]');
  const collectionPopover = $<HTMLElement>('[data-collection-popover]');
  const collectionOptions = $<HTMLElement>('[data-collection-options]');
  const collectionSearch = $<HTMLInputElement>('[data-collection-search]');
  const collectionLabel = $<HTMLElement>('[data-collection-label]');
  const publishSettingsTrigger = $<HTMLButtonElement>(
    '[data-publish-settings-trigger]',
  );
  const publishPopover = $<HTMLElement>('[data-publish-popover]');
  const hideLatest = $<HTMLInputElement>('[data-hide-latest]');
  const publishDate = $<HTMLInputElement>('[data-publish-date]');
  const customSlug = $<HTMLInputElement>('[data-custom-slug]');
  const visibilityDescription = $<HTMLElement>('[data-visibility-description]');
  const confirmPanel = $<HTMLElement>('[data-writer-confirm]');
  const attachedPanel = $<HTMLElement>('[data-attached-panel]');

  const storageKey = 'lmd:writer-draft:v2';
  const localWriter = root.dataset.localWriter === 'true';
  const sessionEndpoint = localWriter ? '/__lmd/session' : '/api/admin/session';
  const writeEndpoint = localWriter ? '/__lmd/write' : '/api/admin/posts';
  const availableCollections = new Set<string>(
    JSON.parse(root.dataset.collections || '[]') as string[],
  );
  const searchParams = new URLSearchParams(window.location.search);
  const editSlug = searchParams.get('edit');
  const replySlug = searchParams.get('reply');
  // 回复目标没有串文时，与回复内容一并补写串文键。
  let replyThreadId = '';
  let replyNeedsBackfill = false;
  let replyTargetContent = '';
  let editThreadId = '';
  let replyContextHtml = '';
  let replyContextExpanded = false;
  // 上文与预览使用站内一致的中西文间距。
  const typography = new Heti(
    '.writer-reply-context-body, .writer-reply-context-meta, [data-writer-preview]',
  );

  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
  }).format(new Date());

  let state: WriterState = {
    items: [blankWriterItem()],
    activeIndex: 0,
    collections: [],
    visibility: 'public',
    pubDate: today,
    customSlug: '',
  };
  let autosaveTimer = 0;
  let cleanSnapshot = writerContentSnapshot(state);

  // 保留字面量键，使 icon() 能检查图标名称。
  const TOOL_ICONS = {
    media:
      '<rect x="2.75" y="3" width="12.5" height="11.25" rx="3" /><circle cx="6.15" cy="6.85" r="0.85" fill="currentColor" stroke="none" /><path d="M3.6 11.95 6.75 8.8c.42-.42 1.11-.42 1.53 0l1.4 1.4" /><path d="m8.95 10.2 1.38-1.38c.46-.46 1.21-.46 1.67 0l2.4 2.4" />',
    text: '<rect x="3" y="2.75" width="12" height="12.5" rx="3.1" /><path d="M5.85 6.35h6.3" /><path d="M5.85 9h6.3" /><path d="M5.85 11.65h4.35" />',
    emoji:
      '<circle cx="9" cy="9" r="6.8" /><path d="M6.2 10.55c.52 1.08 1.46 1.8 2.8 1.8s2.28-.72 2.8-1.8" /><circle cx="6.5" cy="7.15" r="0.7" fill="currentColor" stroke="none" /><circle cx="11.5" cy="7.15" r="0.7" fill="currentColor" stroke="none" />',
    rate: '<path d="m9 1.95 2.08 4.21 4.65.67-3.36 3.29.8 4.63L9 12.55l-4.17 2.2.8-4.63-3.36-3.29 4.65-.67z" fill="currentColor" fill-opacity="0.12" stroke="none" /><path d="m9 1.95 2.08 4.21 4.65.67-3.36 3.29.8 4.63L9 12.55l-4.17 2.2.8-4.63-3.36-3.29 4.65-.67z" stroke-width="1.6" />',
    title:
      '<rect x="3.35" y="3.2" width="11.3" height="2.05" rx="0.68" fill="currentColor" stroke="none" /><rect x="7.8" y="4.6" width="2.4" height="9.45" rx="0.78" fill="currentColor" stroke="none" /><rect x="6.75" y="13.15" width="4.5" height="1.12" rx="0.56" fill="currentColor" stroke="none" />',
    preview:
      '<path d="M5.85 3H3v2.85" stroke-width="1.48" /><path d="M12.15 3H15v2.85" stroke-width="1.48" /><path d="M3 12.15V15h2.85" stroke-width="1.48" /><path d="M15 12.15V15h-2.85" stroke-width="1.48" />',
  };
  const icon = (name: keyof typeof TOOL_ICONS) =>
    `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_ICONS[name]}</svg>`;

  const formatSwitcher = (item: WriterItem, index: number) => `
    <div class="writer-item-formats" role="group" aria-label="第 ${index + 1} 条内容形式">
      ${(['note', 'link', 'quote'] as WriterKind[])
        .map(
          (kind) => `
            <button
              type="button"
              data-item-kind="${kind}"
              data-index="${index}"
              class="${item.kind === kind ? 'is-active' : ''}"
              aria-pressed="${item.kind === kind}"
            >${kind === 'note' ? '随记' : kind === 'link' ? '链接' : '引文'}</button>
          `,
        )
        .join('')}
    </div>
  `;

  const starRating = (item: WriterItem, index: number) => {
    if (!item.showRating) return '';
    const current = Number(item.rating) || 0;
    return `
      <div class="writer-star-rating" role="group" aria-label="评分">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `<button
              type="button"
              class="writer-star${current >= n ? ' is-filled' : ''}"
              data-set-rating="${n}"
              data-index="${index}"
              aria-label="${n} 星"
              aria-pressed="${current === n}"
            >${current >= n ? '★' : '☆'}</button>`,
          )
          .join('')}
        ${current > 0 ? `<span class="writer-star-label">${current}/5</span>` : ''}
      </div>
    `;
  };

  const toolbar = (item: WriterItem, index: number) => `
    ${starRating(item, index)}
    <div class="writer-compose-tools" aria-label="撰写工具">
      <button type="button" data-tool="media" data-index="${index}" title="插入媒体">
        ${icon('media')}<span class="sr-only">媒体</span>
      </button>
      <button type="button" data-tool="text" data-index="${index}" title="添加附文">
        ${icon('text')}<span class="sr-only">附文</span>
      </button>
      <button type="button" data-tool="emoji" data-index="${index}" title="插入表情">
        ${icon('emoji')}<span class="sr-only">表情</span>
      </button>
      <span class="writer-tool-divider"></span>
      <button
        type="button"
        data-tool="rate"
        data-index="${index}"
        title="评分"
        aria-pressed="${item.showRating}"
      >${icon('rate')}<span class="sr-only">评分</span></button>
      ${
        item.kind === 'note'
          ? `<button
              type="button"
              data-tool="title"
              data-index="${index}"
              title="标题"
              aria-pressed="${item.showTitle}"
            >${icon('title')}<span class="sr-only">标题</span></button>`
          : ''
      }
      <span class="writer-tool-spacer"></span>
      <button type="button" data-tool="preview" data-index="${index}" title="实时预览">
        ${icon('preview')}<span class="sr-only">实时预览</span>
      </button>
    </div>
  `;

  const renderItem = (item: WriterItem, index: number) => `
    <section
      class="writer-item"
      data-writer-item
      data-index="${index}"
      data-kind="${item.kind}"
      data-active="${state.activeIndex === index}"
    >
      <div class="writer-thread-node" aria-hidden="true"></div>
      ${
        // 串文和回复在每条内容内显示形式切换。
        state.items.length > 1 || replyContextHtml
          ? `<div class="writer-item-head">
              ${formatSwitcher(item, index)}
              ${
                state.items.length > 1
                  ? `<button
                      type="button"
                      class="writer-remove-item"
                      data-remove-item="${index}"
                      aria-label="删除第 ${index + 1} 条"
                    >×</button>`
                  : ''
              }
            </div>`
          : ''
      }
      <div class="writer-item-fields">
        ${renderWriterFields(item)}
      </div>
      ${toolbar(item, index)}
    </section>
  `;

  const syncItemFromElement = (element: HTMLElement) => {
    const index = Number(element.dataset.index);
    const item = state.items[index];
    if (!item) return;
    element
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('[data-field-name]')
      .forEach((field) => {
        const key = field.dataset.fieldName as keyof WriterItem;
        if (typeof item[key] === 'string') {
          (item[key] as string) = field.value;
        }
      });
  };

  const syncAllItems = () => {
    itemsHost
      .querySelectorAll<HTMLElement>('[data-writer-item]')
      .forEach(syncItemFromElement);
    state.pubDate = publishDate.value;
    state.customSlug = customSlug.value.trim();
  };

  const isItemReady = (item: WriterItem) => {
    if (item.kind === 'link') {
      return Boolean(item.externalUrl.trim() && item.title.trim());
    }
    return Boolean(item.body.trim() || item.title.trim());
  };

  const isReady = () => state.items.every(isItemReady);

  const setStatus = (message: string, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
  };

  const updateHeaderFormat = () => {
    const activeKind = state.items[state.activeIndex]?.kind ?? 'note';
    headerFormats.dataset.kind = activeKind;
    headerFormats
      .querySelectorAll<HTMLButtonElement>('[data-header-kind]')
      .forEach((button) => {
        const active = button.dataset.headerKind === activeKind;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
  };

  const updateVisibilityControls = () => {
    const hidden = state.visibility === 'hidden';
    hideLatest.checked = hidden;
    root
      .querySelectorAll<HTMLButtonElement>('[data-visibility]')
      .forEach((chip) => {
        const active = chip.dataset.visibility === state.visibility;
        chip.classList.toggle('is-selected', active);
        chip.setAttribute('aria-checked', String(active));
      });
    publishButton.textContent =
      state.visibility === 'private'
        ? '保存草稿'
        : editSlug
          ? '更新'
          : replySlug
            ? '回复'
            : state.items.length > 1
              ? '发布串文'
              : '发布';
    visibilityDescription.textContent =
      state.visibility === 'public'
        ? '会显示在首页最新内容中。'
        : state.visibility === 'hidden'
          ? '可以通过链接访问，但不显示在首页。'
          : '只写入草稿，不会出现在公开页面。';
  };

  const renderItems = (focusIndex?: number) => {
    itemsHost.innerHTML =
      replyContextHtml + state.items.map(renderItem).join('');
    // 回复上文作为串文首节显示。
    const threadMode = state.items.length > 1 || Boolean(replyContextHtml);
    headerFormats.hidden = threadMode;
    threadHeading.hidden = !threadMode;
    itemsHost.dataset.threadMode = String(threadMode);
    publishButton.disabled = !isReady();
    addThreadButton.disabled = !isReady() || Boolean(editSlug);
    updateHeaderFormat();
    updateVisibilityControls();
    updatePreview();
    renderCollections();
    typography.autoSpacing();

    if (focusIndex !== undefined) {
      const item = itemsHost.querySelector<HTMLElement>(
        `[data-writer-item][data-index="${focusIndex}"]`,
      );
      item?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        item
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            'textarea, input',
          )
          ?.focus();
      }, 220);
    }
  };

  function updatePreview() {
    const item = state.items[state.activeIndex] ?? state.items[0];
    if (!item) return;
    preview.innerHTML = renderWriterPreview(item, state.pubDate);
    typography.autoSpacing();
  }

  const saveDraft = (announce = false) => {
    syncAllItems();
    const draft: StoredDraft = { version: 2, ...state };
    localStorage.setItem(storageKey, JSON.stringify(draft));
    if (announce) setStatus('草稿已保存在此浏览器。');
  };

  const scheduleDraftSave = () => {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => saveDraft(), 260);
  };

  const restoreDraft = () => {
    if (editSlug) return;
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) || 'null',
      ) as StoredDraft | null;
      if (stored?.version !== 2 || !Array.isArray(stored.items)) return;
      state = {
        items: stored.items.length ? stored.items : [blankWriterItem()],
        activeIndex: Math.min(
          stored.activeIndex || 0,
          Math.max(0, stored.items.length - 1),
        ),
        collections: Array.isArray(stored.collections)
          ? stored.collections
          : [],
        visibility: stored.visibility || 'public',
        pubDate: stored.pubDate || today,
        customSlug: stored.customSlug || '',
      };
    } catch {
      localStorage.removeItem(storageKey);
    }
  };

  /** 验证生产环境的 Access 会话；开发环境直接放行。 */
  const verifySession = async () => {
    if (localWriter) return true;

    try {
      // 不跟随跨源登录重定向，避免未登录时产生 CORS 错误。
      const response = await fetch(sessionEndpoint, {
        credentials: 'same-origin',
        redirect: 'manual',
      });
      const result = (await response.json().catch(() => ({}))) as {
        authenticated?: boolean;
      };
      return response.ok && result.authenticated === true;
    } catch {
      return false;
    }
  };

  const showWriter = async () => {
    writerWindow.hidden = false;
    confirmPanel.hidden = true;
    attachedPanel.hidden = true;
    document.documentElement.dataset.adminAuthenticated = 'true';
    (
      window as typeof window & { __lmdAdminAuthenticated?: boolean }
    ).__lmdAdminAuthenticated = true;
    document.dispatchEvent(new CustomEvent('lmd:admin-authenticated'));
    restoreDraft();
    publishDate.value = state.pubDate;
    customSlug.value = state.customSlug;
    renderItems();
    if (editSlug) await loadPostForEditing(editSlug);
    else if (replySlug) await loadReplyTarget(replySlug);
    cleanSnapshot = writerContentSnapshot(state);
    // 编辑和回复加载完成后再聚焦输入框。
    focusFirstField(state.activeIndex);
  };

  // 仅在内容相对载入或发布后的基准有变化时确认。
  const hasUnsavedChanges = () => {
    syncAllItems();
    return writerContentSnapshot(state) !== cleanSnapshot;
  };

  const toggleConfirm = (open: boolean) => {
    confirmPanel.hidden = !open;
    if (open) {
      confirmPanel
        .querySelector<HTMLButtonElement>('[data-confirm-save]')
        ?.focus();
    }
  };

  const closeWriter = () => {
    toggleConfirm(false);
    window.location.href = '/';
  };

  const requestClose = () => {
    if (!confirmPanel.hidden) return;
    if (hasUnsavedChanges()) {
      toggleConfirm(true);
      return;
    }
    closeWriter();
  };

  const showUnavailable = () => {
    writerWindow.hidden = true;
    setStatus('撰写接口不可用：请确认已登录，且 /api/admin 已部署。', true);
  };

  /** 使用精简 Markdown 渲染上文，并移除不支持的容器指令。 */
  const replyContextMarkup = (
    parsed: ReturnType<typeof parseExistingPost>,
    pubDate: string,
  ) => {
    const item = parsed.item;
    const date = pubDate
      ? new Date(`${pubDate}T00:00:00+08:00`).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';
    const inner =
      item.kind === 'quote'
        ? `<blockquote class="writer-preview-quote"><span aria-hidden="true">“</span>${markdownBlocks(stripDirectives(item.body))}${item.source ? `<cite>— ${escapeHtml(item.source)}</cite>` : ''}</blockquote>`
        : item.kind === 'link'
          ? `<div class="writer-preview-link"><a href="${escapeAttribute(item.externalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(formatDisplayDomain(item.externalUrl))}</a></div>${item.title ? `<h2>${escapeHtml(item.title)}</h2>` : ''}${markdownBlocks(stripDirectives(item.commentary))}`
          : `${item.title ? `<h2>${escapeHtml(item.title)}</h2>` : ''}${markdownBlocks(stripDirectives(item.body))}`;

    return `
      <section class="writer-item writer-reply-context" data-reply-context data-expanded="${replyContextExpanded}">
        <div class="writer-thread-node" aria-hidden="true"></div>
        <div class="writer-reply-context-body">${inner}</div>
        <div class="writer-reply-context-meta">
          ${date ? `<span>${escapeHtml(date)}</span><span aria-hidden="true">·</span>` : ''}
          <button type="button" data-reply-context-toggle>${replyContextExpanded ? '收起' : '展开全部'}</button>
        </div>
      </section>
    `;
  };

  async function loadReplyTarget(slug: string) {
    setStatus('正在读取要回复的内容…');
    try {
      const response = await fetch(
        `${writeEndpoint}?slug=${encodeURIComponent(slug)}`,
      );
      const result = (await response.json().catch(() => ({}))) as {
        content?: string;
        error?: string;
      };
      if (!response.ok || !result.content) {
        throw new Error(result.error || '无法读取要回复的内容。');
      }
      replyTargetContent = result.content;
      const parsed = parseExistingPost(result.content, today);
      if (parsed.thread) {
        replyThreadId = parsed.thread;
        replyNeedsBackfill = false;
      } else {
        replyThreadId = `thread-${new Date().toISOString().slice(0, 10)}-${makeWriterId().slice(0, 8)}`;
        replyNeedsBackfill = true;
      }
      state.collections = parsed.collections;
      replyContextHtml = replyContextMarkup(parsed, parsed.pubDate);
      threadHeading!.textContent = '回复';
      renderItems();
      setStatus(`正在回复 ${slug}`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '无法读取要回复的内容。',
        true,
      );
    }
  }

  async function loadPostForEditing(slug: string) {
    setStatus('正在读取文章…');
    try {
      const response = await fetch(
        `${writeEndpoint}?slug=${encodeURIComponent(slug)}`,
      );
      const result = (await response.json().catch(() => ({}))) as {
        content?: string;
        error?: string;
      };
      if (!response.ok || !result.content) {
        throw new Error(result.error || '无法读取这篇文章。');
      }
      const parsed = parseExistingPost(result.content, today);
      state.items = [parsed.item];
      state.activeIndex = 0;
      state.collections = parsed.collections;
      state.visibility = parsed.visibility;
      state.pubDate = parsed.pubDate;
      state.customSlug = slug;
      editThreadId = parsed.thread;
      publishDate!.value = state.pubDate;
      customSlug!.value = slug;
      customSlug!.disabled = true;
      renderItems();
      setStatus(`正在编辑 ${slug}`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '无法读取这篇文章。',
        true,
      );
    }
  }

  const setActiveItem = (index: number) => {
    syncAllItems();
    state.activeIndex = Math.max(0, Math.min(index, state.items.length - 1));
    itemsHost
      .querySelectorAll<HTMLElement>('[data-writer-item]')
      .forEach((item, itemIndex) => {
        item.dataset.active = String(itemIndex === state.activeIndex);
      });
    updateHeaderFormat();
    updatePreview();
  };

  const focusFirstField = (index: number) => {
    itemsHost
      .querySelector<HTMLElement>(`[data-writer-item][data-index="${index}"]`)
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input')
      ?.focus();
  };

  const changeKind = (index: number, kind: WriterKind) => {
    syncAllItems();
    const item = state.items[index];
    if (!item || item.kind === kind) return;
    item.kind = kind;
    state.activeIndex = index;
    renderItems();
    // 切换形式后聚焦第一个字段。
    focusFirstField(index);
    scheduleDraftSave();
  };

  /** 动态加载 emoji-mart；每次关闭后重建 Picker，避免重连后分类丢失。 */
  let emojiContainer: HTMLElement | null = null;
  let emojiTargetIndex = 0;

  const closeEmojiPicker = () => {
    if (!emojiContainer) return;
    emojiContainer.remove();
    emojiContainer = null;
  };

  const openEmojiPicker = async (button: HTMLElement, index: number) => {
    if (emojiContainer) {
      closeEmojiPicker();
      return;
    }
    if (!attachedPanel.hidden) {
      closeAttachedPanel(false);
      return;
    }
    emojiTargetIndex = index;

    const container = document.createElement('div');
    container.className = 'writer-emoji-picker';
    emojiContainer = container;
    writerWindow.appendChild(container);

    let data: unknown;
    let Picker: new (props: Record<string, unknown>) => unknown;
    try {
      const [dataModule, pickerModule] = await Promise.all([
        import('@emoji-mart/data'),
        import('emoji-mart'),
      ]);
      data = dataModule.default;
      Picker = pickerModule.Picker as typeof Picker;
    } catch {
      // 失败时移除容器，确保下次仍可重试。
      if (emojiContainer === container) closeEmojiPicker();
      setStatus('表情面板加载失败，请刷新页面重试。', true);
      return;
    }
    // 加载期间面板可能已关闭。
    if (emojiContainer !== container) return;

    const picker = new Picker({
      data,
      onEmojiSelect: (emoji: { native: string }) => {
        const itemElement = itemsHost.querySelector<HTMLElement>(
          `[data-writer-item][data-index="${emojiTargetIndex}"]`,
        );
        const field =
          itemElement?.querySelector<HTMLTextAreaElement>(
            '[data-field-name="body"]',
          ) ??
          itemElement?.querySelector<HTMLTextAreaElement>(
            '[data-field-name="commentary"]',
          );
        if (field) insertAtCursor(field, emoji.native);
        closeEmojiPicker();
      },
      theme: 'auto',
      previewPosition: 'none',
      skinTonePosition: 'none',
    });
    container.appendChild(picker as unknown as HTMLElement);

    // 优先显示在按钮上方，空间不足时移到下方。
    const btnRect = button.getBoundingClientRect();
    const winRect = writerWindow.getBoundingClientRect();
    const pickerWidth = 352;
    const pickerHeight = 435;
    let left =
      btnRect.left - winRect.left + btnRect.width / 2 - pickerWidth / 2;
    left = Math.max(8, Math.min(left, winRect.width - pickerWidth - 8));
    let top = btnRect.top - winRect.top - pickerHeight - 8;
    if (winRect.top + top < 8) top = btnRect.bottom - winRect.top + 8;
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  };

  let attachedIndex = 0;

  const openAttachedPanel = (index: number) => {
    syncAllItems();
    attachedIndex = index;
    const input = attachedPanel.querySelector<HTMLTextAreaElement>(
      '[data-attached-input]',
    );
    if (input) input.value = state.items[index]?.attachedText ?? '';
    attachedPanel.hidden = false;
    input?.focus();
  };

  const closeAttachedPanel = (save: boolean) => {
    const input = attachedPanel.querySelector<HTMLTextAreaElement>(
      '[data-attached-input]',
    );
    if (save) {
      const item = state.items[attachedIndex];
      if (item) item.attachedText = input?.value ?? '';
      renderItems();
      scheduleDraftSave();
    }
    attachedPanel.hidden = true;
  };

  const uploadEndpoint = localWriter ? '/__lmd/upload' : '/api/admin/upload';

  /** 按 MIME 类型生成可被归档筛选识别的 Markdown。 */
  const mediaMarkdown = (file: File, url: string) => {
    const type = file.type || '';
    if (type.startsWith('image/')) return `\n![](${url})\n`;
    if (type.startsWith('video/')) {
      return `\n<video src="${url}" controls preload="metadata"></video>\n`;
    }
    if (type.startsWith('audio/')) {
      return `\n<audio src="${url}" controls preload="metadata"></audio>\n`;
    }
    return `\n[${file.name}](${url})\n`;
  };

  const pickAndUploadMedia = async (index: number) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '*/*';
    picker.multiple = true;
    picker.style.display = 'none';
    document.body.appendChild(picker);

    const files = await new Promise<File[]>((resolve) => {
      picker.addEventListener('change', () =>
        resolve([...(picker.files ?? [])]),
      );
      picker.addEventListener('cancel', () => resolve([]));
      picker.click();
    });
    picker.remove();
    if (files.length === 0) return;

    setActiveItem(index);
    const itemElement = itemsHost.querySelector<HTMLElement>(
      `[data-writer-item][data-index="${index}"]`,
    );
    const field =
      itemElement?.querySelector<HTMLTextAreaElement>(
        '[data-field-name="body"]',
      ) ??
      itemElement?.querySelector<HTMLTextAreaElement>(
        '[data-field-name="commentary"]',
      );
    if (!field) return;

    for (const file of files) {
      setStatus(`正在上传 ${file.name}…`);
      try {
        const response = await fetch(
          `${uploadEndpoint}?name=${encodeURIComponent(file.name)}`,
          {
            method: 'POST',
            headers: {
              'content-type': file.type || 'application/octet-stream',
            },
            body: file,
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !result.url) {
          throw new Error(result.error || '上传失败。');
        }
        insertAtCursor(field, mediaMarkdown(file, result.url));
        syncAllItems();
        scheduleDraftSave();
        setStatus(`已插入 ${file.name}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '上传失败。', true);
        return;
      }
    }
    updatePreview();
  };

  const insertAtCursor = (field: HTMLTextAreaElement, value: string): void => {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    field.setRangeText(value, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  };

  const generatedSlug = (item: WriterItem, index: number) =>
    makeGeneratedSlug(item, index, state.customSlug);

  const markdownFor = (item: WriterItem, threadId?: string) =>
    serializeMarkdown(item, {
      collections: state.collections,
      visibility: state.visibility,
      pubDate: state.pubDate,
      today,
      threadId,
    });

  const makePublishPayload = () => {
    syncAllItems();
    const threadId =
      replyThreadId ||
      editThreadId ||
      (state.items.length > 1
        ? `thread-${new Date().toISOString().slice(0, 10)}-${makeWriterId().slice(0, 8)}`
        : undefined);
    return state.items.map((item, index) => ({
      slug: editSlug || generatedSlug(item, index),
      content: markdownFor(item, threadId),
    }));
  };

  const copyMarkdown = async () => {
    const posts = makePublishPayload();
    const combined = posts
      .map((post) => `<!-- ${post.slug}.md -->\n${post.content}`)
      .join('\n\n');
    await navigator.clipboard.writeText(combined);
    setStatus(
      posts.length > 1 ? '串文 Markdown 已复制。' : 'Markdown 已复制。',
    );
  };

  const downloadMarkdown = () => {
    const posts = makePublishPayload();
    for (const post of posts) {
      const blob = new Blob([post.content], {
        type: 'text/markdown;charset=utf-8',
      });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `${post.slug}.md`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    }
    setStatus(posts.length > 1 ? '串文文件已下载。' : 'Markdown 已下载。');
  };

  const renderCollections = () => {
    const query = collectionSearch.value.trim().toLocaleLowerCase('zh-CN');
    const names = [...availableCollections].sort((left, right) =>
      left.localeCompare(right, 'zh-CN'),
    );
    collectionOptions.innerHTML = names
      .filter((name) => name.toLocaleLowerCase('zh-CN').includes(query))
      .map(
        (name) => `
          <button
            type="button"
            role="option"
            aria-selected="${state.collections.includes(name)}"
            data-collection-name="${escapeAttribute(name)}"
          >
            <span>${escapeHtml(name)}</span>
            <span aria-hidden="true">${state.collections.includes(name) ? '✓' : ''}</span>
          </button>
        `,
      )
      .join('');
    collectionLabel.textContent =
      state.collections.length === 0
        ? '合集'
        : state.collections.length === 1
          ? state.collections[0]!
          : `${state.collections.length} 个合集`;
  };

  const toggleCollectionPopover = (open?: boolean) => {
    const shouldOpen = open ?? collectionPopover.hidden;
    collectionPopover.hidden = !shouldOpen;
    collectionTrigger.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) {
      collectionSearch.value = '';
      renderCollections();
      collectionSearch.focus();
    }
  };

  const togglePublishPopover = (open?: boolean) => {
    const shouldOpen = open ?? publishPopover.hidden;
    publishPopover.hidden = !shouldOpen;
    publishSettingsTrigger.setAttribute('aria-expanded', String(shouldOpen));
  };

  const setVisibility = (visibility: Visibility) => {
    state.visibility = visibility;
    updateVisibilityControls();
    scheduleDraftSave();
  };

  form.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>('[data-writer-item]');
    if (item) {
      syncItemFromElement(item);
      state.activeIndex = Number(item.dataset.index);
    }
    syncAllItems();
    publishButton.disabled = !isReady();
    addThreadButton.disabled = !isReady() || Boolean(editSlug);
    updateHeaderFormat();
    updatePreview();
    scheduleDraftSave();
  });

  form.addEventListener('focusin', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-writer-item]',
    );
    if (item) setActiveItem(Number(item.dataset.index));
  });

  form.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const kindButton = target.closest<HTMLButtonElement>('[data-item-kind]');
    if (kindButton) {
      changeKind(
        Number(kindButton.dataset.index),
        kindButton.dataset.itemKind as WriterKind,
      );
      return;
    }

    const removeButton =
      target.closest<HTMLButtonElement>('[data-remove-item]');
    if (removeButton) {
      syncAllItems();
      const index = Number(removeButton.dataset.removeItem);
      state.items.splice(index, 1);
      state.activeIndex = Math.max(
        0,
        Math.min(index - 1, state.items.length - 1),
      );
      renderItems();
      scheduleDraftSave();
      return;
    }

    const toolButton = target.closest<HTMLButtonElement>('[data-tool]');
    if (toolButton) {
      const index = Number(toolButton.dataset.index);
      setActiveItem(index);
      const tool = toolButton.dataset.tool;
      if (tool === 'title') {
        syncAllItems();
        const item = state.items[index];
        if (item) item.showTitle = !item.showTitle;
        renderItems();
      } else if (tool === 'rate') {
        syncAllItems();
        const item = state.items[index];
        if (item) {
          item.showRating = !item.showRating;
          // 关闭评分时同步清空分值。
          if (!item.showRating) item.rating = '';
        }
        renderItems();
      } else if (tool === 'media') {
        void pickAndUploadMedia(index);
      } else if (tool === 'text') {
        openAttachedPanel(index);
      } else if (tool === 'emoji') {
        void openEmojiPicker(toolButton, index);
      } else if (tool === 'preview') {
        workspace.dataset.previewOpen = 'true';
        previewPane.hidden = false;
        updatePreview();
      }
      return;
    }

    const starButton = target.closest<HTMLButtonElement>('[data-set-rating]');
    if (starButton) {
      syncAllItems();
      const index = Number(starButton.dataset.index);
      const value = starButton.dataset.setRating ?? '';
      const item = state.items[index];
      if (item) {
        // 再次点击当前分值时取消评分。
        item.rating = item.rating === value ? '' : value;
      }
      renderItems();
      scheduleDraftSave();
      return;
    }
  });

  headerFormats.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-header-kind]',
    );
    if (!button) return;
    changeKind(state.activeIndex, button.dataset.headerKind as WriterKind);
  });

  addThreadButton.addEventListener('click', () => {
    syncAllItems();
    if (!isReady() || editSlug) return;
    const nextIndex = state.items.length;
    state.items.push(blankWriterItem(state.items.at(-1)?.kind ?? 'note'));
    state.activeIndex = nextIndex;
    renderItems(nextIndex);
    scheduleDraftSave();
  });

  collectionTrigger.addEventListener('click', () => {
    toggleCollectionPopover();
    togglePublishPopover(false);
  });
  collectionSearch.addEventListener('input', renderCollections);
  collectionOptions.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-collection-name]',
    );
    const name = button?.dataset.collectionName;
    if (!name) return;
    state.collections = state.collections.includes(name)
      ? state.collections.filter((collection) => collection !== name)
      : [...state.collections, name];
    renderCollections();
    scheduleDraftSave();
  });
  root
    .querySelector('[data-add-collection]')
    ?.addEventListener('click', async () => {
      const name = await askCollectionName();
      if (!name) return;
      availableCollections.add(name);
      if (!state.collections.includes(name)) state.collections.push(name);
      renderCollections();
      scheduleDraftSave();
    });

  publishSettingsTrigger.addEventListener('click', () => {
    togglePublishPopover();
    toggleCollectionPopover(false);
  });
  root
    .querySelector('[data-publish-settings-done]')
    ?.addEventListener('click', () => togglePublishPopover(false));

  root
    .querySelectorAll<HTMLButtonElement>('[data-visibility]')
    .forEach((chip) => {
      chip.addEventListener('click', () =>
        setVisibility(chip.dataset.visibility as Visibility),
      );
    });

  hideLatest.addEventListener('change', () => {
    setVisibility(hideLatest.checked ? 'hidden' : 'public');
  });
  publishDate.addEventListener('input', scheduleDraftSave);
  customSlug.addEventListener('input', scheduleDraftSave);

  root.querySelector('[data-close-preview]')?.addEventListener('click', () => {
    workspace.dataset.previewOpen = 'false';
    window.setTimeout(() => {
      previewPane.hidden = workspace.dataset.previewOpen !== 'true';
    }, 280);
  });

  root
    .querySelector('[data-save-draft]')
    ?.addEventListener('click', () => saveDraft(true));
  root
    .querySelector('[data-copy-markdown]')
    ?.addEventListener('click', () => void copyMarkdown());
  root
    .querySelector('[data-download-markdown]')
    ?.addEventListener('click', downloadMarkdown);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    syncAllItems();
    if (!isReady()) {
      setStatus('请先补全当前内容。', true);
      return;
    }

    const posts = makePublishPayload();
    if (posts.some((post) => !post.slug)) {
      setStatus('无法生成链接名称，请在发布设置中填写一个。', true);
      return;
    }

    publishButton.disabled = true;
    publishButton.textContent = editSlug ? '更新中…' : '发布中…';
    setStatus(
      localWriter ? '正在写入本地内容目录…' : '正在提交到受保护的发布接口…',
    );

    try {
      const publishItems: Array<{
        slug: string;
        content: string;
        operation?: 'create' | 'update';
      }> = [...posts];
      if (replySlug && replyNeedsBackfill) {
        if (!replyTargetContent) throw new Error('无法读取要回复的内容。');
        publishItems.push({
          slug: replySlug,
          content: setPostThread(replyTargetContent, replyThreadId),
          operation: 'update' as const,
        });
      }
      const response = await fetch(
        editSlug
          ? `${writeEndpoint}?slug=${encodeURIComponent(editSlug)}`
          : writeEndpoint,
        {
          method: editSlug ? 'PUT' : 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ posts: publishItems }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        urls?: string[];
      };
      if (!response.ok) throw new Error(result.error || '发布失败。');

      replyNeedsBackfill = false;

      window.clearTimeout(autosaveTimer);
      autosaveTimer = 0;
      localStorage.removeItem(storageKey);
      cleanSnapshot = writerContentSnapshot(state);
      const urls =
        result.urls?.slice(0, posts.length) ??
        posts.map((post) => `/${post.slug}`);
      setStatus(
        `${editSlug ? '已更新' : posts.length > 1 ? '串文已发布' : '已发布'}：${urls.join('、')}`,
      );
      if (urls[0]) {
        window.history.replaceState(
          null,
          '',
          `/write?edit=${encodeURIComponent(posts[0]!.slug)}`,
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '发布失败，请稍后再试。',
        true,
      );
    } finally {
      publishButton.disabled = !isReady();
      updateVisibilityControls();
    }
  });

  root
    .querySelector('[data-writer-close]')
    ?.addEventListener('click', requestClose);

  attachedPanel
    .querySelector('[data-attached-cancel]')
    ?.addEventListener('click', () => closeAttachedPanel(false));
  attachedPanel
    .querySelector('[data-attached-done]')
    ?.addEventListener('click', () => closeAttachedPanel(true));

  itemsHost.addEventListener('click', (event) => {
    const toggle = (event.target as HTMLElement).closest(
      '[data-reply-context-toggle]',
    );
    if (!toggle) return;
    replyContextExpanded = !replyContextExpanded;
    const context = itemsHost.querySelector<HTMLElement>(
      '[data-reply-context]',
    );
    if (!context) return;
    context.dataset.expanded = String(replyContextExpanded);
    toggle.textContent = replyContextExpanded ? '收起' : '展开全部';
  });

  root.querySelector('[data-confirm-save]')?.addEventListener('click', () => {
    saveDraft();
    closeWriter();
  });
  root
    .querySelector('[data-confirm-discard]')
    ?.addEventListener('click', () => {
      localStorage.removeItem(storageKey);
      closeWriter();
    });
  root
    .querySelector('[data-confirm-cancel]')
    ?.addEventListener('click', () => toggleConfirm(false));
  confirmPanel.addEventListener('click', (event) => {
    if (event.target === confirmPanel) toggleConfirm(false);
  });

  // Esc 依次关闭浮层，最后触发草稿关闭确认。
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || writerWindow.hidden) return;
    event.preventDefault();
    if (emojiContainer) {
      closeEmojiPicker();
      return;
    }
    if (!confirmPanel.hidden) {
      toggleConfirm(false);
      return;
    }
    if (!publishPopover.hidden) {
      togglePublishPopover(false);
      return;
    }
    if (!collectionPopover.hidden) {
      toggleCollectionPopover(false);
      return;
    }
    requestClose();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    if (
      emojiContainer &&
      !emojiContainer.contains(target) &&
      !(target as HTMLElement).closest?.('[data-tool="emoji"]')
    ) {
      closeEmojiPicker();
    }
    if (
      !collectionPopover.hidden &&
      !collectionPopover.contains(target) &&
      !collectionTrigger.contains(target)
    ) {
      toggleCollectionPopover(false);
    }
    if (
      !publishPopover.hidden &&
      !publishPopover.contains(target) &&
      !publishSettingsTrigger.contains(target)
    ) {
      togglePublishPopover(false);
    }
  });

  void (async () => {
    if (await verifySession()) {
      await showWriter();
    } else {
      showUnavailable();
    }
  })();
}

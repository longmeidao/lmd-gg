import Heti from 'heti/js/heti-addon.js';
import {
  blankWriterItem,
  makeWriterId,
  type StoredDraft,
  type Visibility,
  type WriterItem,
  type WriterKind,
  type WriterState,
} from './writer/model';
import {
  escapeAttribute,
  escapeHtml,
  formatDisplayDomain,
  markdownBlocks,
  stripDirectives,
} from './writer/markdown';
import { parseExistingPost, setPostThread } from './writer/frontmatter';
import {
  generatedSlug as makeGeneratedSlug,
  markdownFor as serializeMarkdown,
} from './writer/publish';

const root = document.querySelector<HTMLElement>('[data-writer-root]');

if (root) {
  const writerWindow = root.querySelector<HTMLElement>('[data-writer-window]');
  const form = root.querySelector<HTMLFormElement>('[data-writer-form]');
  const itemsHost = root.querySelector<HTMLElement>('[data-writer-items]');
  const workspace = root.querySelector<HTMLElement>('.writer-workspace');
  const previewPane = root.querySelector<HTMLElement>('[data-preview-pane]');
  const preview = root.querySelector<HTMLElement>('[data-writer-preview]');
  const status = root.querySelector<HTMLElement>('[data-writer-status]');
  const publishButton = root.querySelector<HTMLButtonElement>(
    '[data-writer-publish]',
  );
  const addThreadButton =
    root.querySelector<HTMLButtonElement>('[data-add-thread]');
  const headerFormats = root.querySelector<HTMLElement>(
    '[data-header-formats]',
  );
  const threadHeading = root.querySelector<HTMLElement>(
    '[data-thread-heading]',
  );
  const collectionTrigger = root.querySelector<HTMLButtonElement>(
    '[data-collection-trigger]',
  );
  const collectionPopover = root.querySelector<HTMLElement>(
    '[data-collection-popover]',
  );
  const collectionOptions = root.querySelector<HTMLElement>(
    '[data-collection-options]',
  );
  const collectionSearch = root.querySelector<HTMLInputElement>(
    '[data-collection-search]',
  );
  const collectionLabel = root.querySelector<HTMLElement>(
    '[data-collection-label]',
  );
  const publishSettingsTrigger = root.querySelector<HTMLButtonElement>(
    '[data-publish-settings-trigger]',
  );
  const publishPopover = root.querySelector<HTMLElement>(
    '[data-publish-popover]',
  );
  const hideLatest = root.querySelector<HTMLInputElement>('[data-hide-latest]');
  const publishDate = root.querySelector<HTMLInputElement>(
    '[data-publish-date]',
  );
  const customSlug = root.querySelector<HTMLInputElement>('[data-custom-slug]');
  const visibilityDescription = root.querySelector<HTMLElement>(
    '[data-visibility-description]',
  );
  const confirmPanel = root.querySelector<HTMLElement>('[data-writer-confirm]');
  const attachedPanel = root.querySelector<HTMLElement>(
    '[data-attached-panel]',
  );

  if (
    !writerWindow ||
    !form ||
    !itemsHost ||
    !workspace ||
    !previewPane ||
    !preview ||
    !status ||
    !publishButton ||
    !addThreadButton ||
    !headerFormats ||
    !threadHeading ||
    !collectionTrigger ||
    !collectionPopover ||
    !collectionOptions ||
    !collectionSearch ||
    !collectionLabel ||
    !publishSettingsTrigger ||
    !publishPopover ||
    !hideLatest ||
    !publishDate ||
    !customSlug ||
    !visibilityDescription ||
    !confirmPanel ||
    !attachedPanel
  ) {
    throw new Error('Writer UI is incomplete.');
  }

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
  // 回复目标所在的串文；新建串文时与回复内容同一次提交
  let replyThreadId = '';
  let replyNeedsBackfill = false;
  let replyTargetContent = '';
  let editThreadId = '';
  /** 回复时渲染在编辑区上方的「上文」，作为串文的第一个节点 */
  let replyContextHtml = '';
  let replyContextExpanded = false;
  // 上文和预览里的中西混排要和主站一致（首页对 .home-entry-date 也是这么做的）
  const typography = new Heti(
    '.writer-reply-context-body, .writer-reply-context-meta, [data-writer-preview]',
  );

  const makeId = makeWriterId;
  const blankItem = blankWriterItem;

  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
  }).format(new Date());

  let state: WriterState = {
    items: [blankItem()],
    activeIndex: 0,
    collections: [],
    visibility: 'public',
    pubDate: today,
    customSlug: '',
  };
  let autosaveTimer = 0;

  // 图标取自 jant 的 compose 工具栏（18×18 视口，1.55 线宽），保持视觉一致
  const icon = (
    name: 'media' | 'text' | 'emoji' | 'rate' | 'title' | 'preview',
  ) => {
    const icons = {
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
    return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  };

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

  /** 可视化星级：5 颗可点的星 + n/5，做法同 jant 的 .compose-star-rating */
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
        placeholder="粘贴链接…"
        value="${escapeAttribute(item.externalUrl)}"
      />
    </label>
    <input
      class="writer-title-input"
      data-field-name="title"
      aria-label="链接标题"
      placeholder="给它一个标题…"
      value="${escapeAttribute(item.title)}"
    />
    <textarea
      class="writer-commentary-textarea"
      data-field-name="commentary"
      aria-label="我的评论"
      placeholder="你的想法（可选）"
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
        placeholder="作者（可选）"
        value="${escapeAttribute(item.source)}"
      />
    </label>
    <input
      class="writer-source-link"
      data-field-name="externalUrl"
      aria-label="来源链接"
      inputmode="url"
      placeholder="来源链接（可选）"
      value="${escapeAttribute(item.externalUrl)}"
    />
    <textarea
      class="writer-commentary-textarea"
      data-field-name="commentary"
      aria-label="我的评论"
      placeholder="你的想法（可选）"
    >${escapeHtml(item.commentary)}</textarea>
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
        // 串文或回复时顶栏让位给标题，形式切换下沉到每条内容自己头上
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
        ${item.kind === 'note' ? noteFields(item) : item.kind === 'link' ? linkFields(item) : quoteFields(item)}
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
    // 回复时上文本身就是串文的第一节，所以也要走串文版式
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
    const date = state.pubDate
      ? new Date(`${state.pubDate}T00:00:00`).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '发布时';
    const rating = item.rating
      ? `<span class="writer-preview-rating">${'★'.repeat(Number(item.rating))}${'☆'.repeat(5 - Number(item.rating))}</span>`
      : '';

    if (item.kind === 'link') {
      preview!.innerHTML = `
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
        <footer><span class="writer-preview-date">${date}</span>${rating}</footer>
      `;
      return;
    }
    if (item.kind === 'quote') {
      preview!.innerHTML = `
        <blockquote class="writer-preview-quote">
          <span aria-hidden="true">“</span>
          ${markdownBlocks(item.body || '引文会显示在这里。')}
          ${item.source ? `<cite>— ${escapeHtml(item.source)}</cite>` : ''}
          ${item.externalUrl ? `<a href="${escapeAttribute(item.externalUrl)}" aria-label="打开来源链接">↗</a>` : ''}
        </blockquote>
        ${markdownBlocks(item.commentary)}
        <footer><span class="writer-preview-date">${date}</span>${rating}</footer>
      `;
      return;
    }
    preview!.innerHTML = `
      ${item.showTitle && item.title ? `<h1>${escapeHtml(item.title)}</h1>` : ''}
      ${markdownBlocks(item.body || '内容会实时显示在这里。')}
      <footer><span class="writer-preview-date">${date}</span>${rating}</footer>
    `;
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
        items: stored.items.length ? stored.items : [blankItem()],
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

  /**
   * 身份由 Cloudflare Access 管，浏览器自动带 CF_Authorization Cookie，
   * 前端不再持有任何密钥。本地 dev 没有 Access，dev 端点直接放行。
   */
  const verifySession = async () => {
    // 本地 dev 端点只监听开发服务器，直接进入编辑器，不依赖 Access/session。
    if (localWriter) return true;

    try {
      const response = await fetch(sessionEndpoint, {
        credentials: 'same-origin',
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
  };

  // 有任意字段填过内容就算「有草稿」，退出时需要确认
  const hasContent = () => {
    syncAllItems();
    return state.items.some((item) =>
      [
        item.title,
        item.body,
        item.externalUrl,
        item.source,
        item.commentary,
        item.attachedText,
      ].some((value) => value.trim().length > 0),
    );
  };

  const toggleConfirm = (open: boolean) => {
    confirmPanel.hidden = !open;
    if (open) {
      confirmPanel
        .querySelector<HTMLButtonElement>('[data-confirm-save]')
        ?.focus();
    }
  };

  // 只是关掉撰写窗口回首页，不清访问密钥（个人设备上不需要每次重新登录）
  const closeWriter = () => {
    toggleConfirm(false);
    window.location.href = '/';
  };

  const requestClose = () => {
    if (!confirmPanel.hidden) return;
    if (hasContent()) {
      toggleConfirm(true);
      return;
    }
    closeWriter();
  };

  /**
   * 走到这里说明会话没通过。生产环境下 Access 会在页面加载前就把未登录的人
   * 挡在外面，所以这多半是接口没部署或 Access 配错了。
   */
  const showUnavailable = () => {
    writerWindow.hidden = true;
    setStatus('撰写接口不可用：请确认已登录，且 /api/admin 已部署。', true);
  };

  /**
   * 上文只用编辑器里那套精简 markdown 渲染，站点的 remark 插件语法（`::: info`
   * 这类容器指令）在这里没有对应实现，直接丢掉外壳只留内容，免得露出源码。
   */
  /** 上文的只读预览：结构和首页条目一致，但不可编辑 */
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

  /** 打开回复：读取上文及串文 id。 */
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
        replyThreadId = `thread-${new Date().toISOString().slice(0, 10)}-${makeId().slice(0, 8)}`;
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

  const changeKind = (index: number, kind: WriterKind) => {
    syncAllItems();
    const item = state.items[index];
    if (!item || item.kind === kind) return;
    item.kind = kind;
    state.activeIndex = index;
    renderItems();
    scheduleDraftSave();
  };

  /**
   * emoji 选择器：和 jant 一样用 emoji-mart（动态 import，不进主包）。
   * jant 那边每次关闭后重建 Picker —— emoji-mart 在 disconnect/reconnect 之后
   * 行观察器恢复不可靠，会让后面的分类空掉，这里照办。
   */
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
      // 加载失败必须把容器撤掉：留着它会让下一次点击走到「关闭」分支，
      // 按钮看起来就彻底没反应了。
      if (emojiContainer === container) closeEmojiPicker();
      setStatus('表情面板加载失败，请刷新页面重试。', true);
      return;
    }
    // 异步 import 期间可能已经被关掉了
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

    // 相对撰写窗口定位：优先放按钮上方，放不下就翻到下面
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

  /**
   * 附文面板：铺满撰写窗口的覆盖层，带进场动画（同 jant 的 .compose-attached-panel）。
   * 原来是挤在工具栏下面的一小块 textarea，改成整屏切换后才放得下长文。
   */
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

  /**
   * 插图=上传，而不是粘链接：开系统文件选择器 → POST 到写接口 → 插入返回的地址。
   * dev 走 /__lmd/upload（写进 public/media/uploads），生产留给 /api/admin/upload。
   */
  const uploadEndpoint = localWriter ? '/__lmd/upload' : '/api/admin/upload';

  /**
   * 按 MIME 归类，决定插进正文的写法 —— 归档页的媒介筛选就靠这些标记认出来。
   * jant 的 UPLOAD_ACCEPT 收所有类型，这里照办：图片以外的媒体也能传。
   */
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
        ? `thread-${new Date().toISOString().slice(0, 10)}-${makeId().slice(0, 8)}`
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
          // 关掉评分就把分数一起清掉，免得留下看不见的评分
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
        // 再点当前分数就取消，和大多数星级控件的手感一致
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
    state.items.push(blankItem(state.items.at(-1)?.kind ?? 'note'));
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
  root.querySelector('[data-add-collection]')?.addEventListener('click', () => {
    const name = window.prompt('新的合集名称')?.trim();
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

      localStorage.removeItem(storageKey);
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

  // Esc：先收起已展开的浮层，都关掉之后再询问是否保存草稿并关闭
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

const BANGUMI_SUBJECT_TYPES = [
  { id: 2, key: 'anime', label: '番剧' },
  { id: 4, key: 'game', label: '游戏' },
  { id: 1, key: 'book', label: '书籍' },
  { id: 6, key: 'real', label: '影视' },
  { id: 3, key: 'music', label: '音乐' },
];

const BANGUMI_COLLECTION_TYPES = [3, 2, 1];
const BANGUMI_PAGE_SIZE = 12;
const BANGUMI_API_PAGE_SIZE = 100;

const BANGUMI_STATUS_LABELS = {
  anime: { 1: '想看', 2: '看过', 3: '在看' },
  real: { 1: '想看', 2: '看过', 3: '在看' },
  game: { 1: '想玩', 2: '玩过', 3: '在玩' },
  book: { 1: '想读', 2: '读过', 3: '在读' },
  music: { 1: '想听', 2: '听过', 3: '在听' },
};

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setFilterButtonContent(button, label, count) {
  button.replaceChildren(createElement('span', '', label));
  if (count === undefined) return;

  const countElement = createElement('sup', 'bgm-filter-count', String(count));
  countElement.setAttribute('aria-hidden', 'true');
  button.appendChild(countElement);
  button.setAttribute('aria-label', `${label}，${count} 项`);
}

function getBangumiConfig() {
  return {
    apiUrl: 'https://api.bgm.tv',
    username: 'longmeidao',
    ...window.bgmConfig,
  };
}

function getProgress(item, subjectType, collectionType) {
  const subject = item.subject || {};
  let current = 0;
  let total = 0;
  let label = '话数';

  if (subjectType.key === 'game' && Number(item.rate) > 0) {
    current = Number(item.rate);
    total = 10;
    label = '评分';
  } else if (subjectType.key === 'book' && Number(subject.volumes) > 0) {
    current = Number(item.vol_status) || 0;
    total = Number(subject.volumes) || 0;
    label = '卷数';
  } else if (
    subjectType.key === 'anime' ||
    subjectType.key === 'real' ||
    subjectType.key === 'book'
  ) {
    current = Number(item.ep_status) || 0;
    total = Number(subject.eps) || 0;
  } else {
    return null;
  }

  if (subjectType.key !== 'game' && collectionType === 2 && total > 0)
    current = total;

  return {
    current,
    total,
    label,
    percent: total > 0 ? Math.min(100, (current / total) * 100) : 0,
  };
}

function createBangumiCard(item, subjectType, collectionType) {
  const subject = item.subject || {};
  const title = subject.name_cn || subject.name || '未命名条目';
  const cover =
    subject.images?.large ||
    subject.images?.common ||
    subject.images?.medium ||
    '';
  const subjectId = subject.id || item.subject_id;
  const card = createElement('a', 'bgm-item');

  card.href = `https://bgm.tv/subject/${subjectId}`;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('aria-label', `${title}（在新窗口打开）`);

  const thumb = createElement('div', 'bgm-item-thumb');
  if (cover)
    thumb.style.backgroundImage = `url("${cover.replace(/"/g, '%22')}")`;
  card.appendChild(thumb);

  const info = createElement('div', 'bgm-item-info');
  const titleElement = createElement('span', 'bgm-item-title main', title);
  titleElement.title = title;
  info.appendChild(titleElement);

  const originalTitle = createElement(
    'span',
    'bgm-item-title',
    subject.name || title,
  );
  info.appendChild(originalTitle);

  const progress = getProgress(item, subjectType, collectionType);
  if (progress) {
    const progressContainer = createElement(
      'div',
      'bgm-item-statusBar-container',
    );
    const progressBar = createElement('div', 'bgm-item-statusBar');
    progressBar.style.width = `${progress.percent}%`;
    const totalText = progress.total > 0 ? progress.total : '?';
    const progressText = createElement(
      'span',
      'bgm-item-percentage',
      `${progress.label}：${progress.current} / ${totalText}`,
    );
    progressContainer.append(progressBar, progressText);
    info.appendChild(progressContainer);
  } else {
    const statusLabel = BANGUMI_STATUS_LABELS[subjectType.key][collectionType];
    const metaText = item.rate
      ? `${statusLabel} · ${item.rate} 分`
      : statusLabel;
    info.appendChild(createElement('span', 'bgm-item-meta', metaText));
  }

  card.appendChild(info);
  return card;
}

function initBangumiCollection(container) {
  if (container.dataset.bgmReady === 'true') return;
  container.dataset.bgmReady = 'true';

  const config = getBangumiConfig();
  const cache = new Map();
  const state = {
    subjectType: BANGUMI_SUBJECT_TYPES[0],
    collectionType: 3,
    visibleCount: BANGUMI_PAGE_SIZE,
  };

  const categoryTabs = createElement('div', 'bgm-categories');
  categoryTabs.setAttribute('role', 'group');
  categoryTabs.setAttribute('aria-label', '条目类型');

  const collectionTabs = createElement('div', 'bgm-tabs');
  collectionTabs.setAttribute('role', 'group');
  collectionTabs.setAttribute('aria-label', '收藏状态');

  const collection = createElement('div', 'bgm-collection');
  collection.setAttribute('aria-live', 'polite');
  collection.setAttribute('aria-busy', 'false');

  const navigator = createElement('div', 'bgm-navigator');
  const loadMoreButton = createElement('button', 'bgm-btn', '加载更多');
  loadMoreButton.type = 'button';
  navigator.appendChild(loadMoreButton);

  container.append(categoryTabs, collectionTabs, collection, navigator);

  function getCurrentItems() {
    const items = cache.get(state.subjectType.id) || [];
    return items.filter((item) => Number(item.type) === state.collectionType);
  }

  function renderLoading() {
    collectionTabs.replaceChildren();
    collection.replaceChildren();
    collection.setAttribute('aria-busy', 'true');
    const loading = createElement('div', 'bgm-state');
    const image = createElement('img', 'bgm-loading-image');
    image.src = '/images/mona-loading.gif';
    image.alt = '';
    loading.append(image, createElement('span', '', '正在读取收藏…'));
    collection.appendChild(loading);
    navigator.hidden = true;
  }

  function renderError() {
    collection.replaceChildren();
    collection.setAttribute('aria-busy', 'false');
    const stateElement = createElement('div', 'bgm-state');
    stateElement.appendChild(
      createElement('span', '', '收藏加载失败，请稍后重试。'),
    );
    const retryButton = createElement(
      'button',
      'bgm-btn bgm-retry',
      '重新加载',
    );
    retryButton.type = 'button';
    retryButton.addEventListener('click', () => {
      cache.delete(state.subjectType.id);
      loadSubjectType();
    });
    stateElement.appendChild(retryButton);
    collection.appendChild(stateElement);
    navigator.hidden = true;
  }

  function renderCollectionTabs() {
    collectionTabs.replaceChildren();
    const allItems = cache.get(state.subjectType.id) || [];
    const labels = BANGUMI_STATUS_LABELS[state.subjectType.key];

    for (const collectionType of BANGUMI_COLLECTION_TYPES) {
      const count = allItems.filter(
        (item) => Number(item.type) === collectionType,
      ).length;
      const button = createElement('button', 'bgm-tab');
      setFilterButtonContent(button, labels[collectionType], count);
      button.type = 'button';
      button.dataset.collectionType = String(collectionType);
      button.setAttribute(
        'aria-pressed',
        String(collectionType === state.collectionType),
      );
      if (collectionType === state.collectionType)
        button.classList.add('bgm-active');
      button.addEventListener('click', () => {
        if (state.collectionType === collectionType) return;
        state.collectionType = collectionType;
        state.visibleCount = BANGUMI_PAGE_SIZE;
        renderCollectionTabs();
        renderItems();
      });
      collectionTabs.appendChild(button);
    }
  }

  function renderItems() {
    const items = getCurrentItems();
    collection.replaceChildren();
    collection.setAttribute('aria-busy', 'false');

    if (items.length === 0) {
      collection.appendChild(
        createElement('div', 'bgm-state', '这个分类下还没有收藏。'),
      );
      navigator.hidden = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items.slice(0, state.visibleCount)) {
      fragment.appendChild(
        createBangumiCard(item, state.subjectType, state.collectionType),
      );
    }
    collection.appendChild(fragment);
    navigator.hidden = state.visibleCount >= items.length;
  }

  function renderCategoryTabs() {
    categoryTabs.replaceChildren();
    for (const subjectType of BANGUMI_SUBJECT_TYPES) {
      const button = createElement('button', 'bgm-category', subjectType.label);
      button.type = 'button';
      button.dataset.subjectType = String(subjectType.id);
      button.setAttribute(
        'aria-pressed',
        String(subjectType.id === state.subjectType.id),
      );
      if (subjectType.id === state.subjectType.id)
        button.classList.add('bgm-category-active');
      button.addEventListener('click', () => {
        if (state.subjectType.id === subjectType.id) return;
        state.subjectType = subjectType;
        state.collectionType = 3;
        state.visibleCount = BANGUMI_PAGE_SIZE;
        renderCategoryTabs();
        loadSubjectType();
      });
      categoryTabs.appendChild(button);
    }
  }

  async function fetchSubjectType(subjectType) {
    const items = [];
    let offset = 0;
    let total = 0;

    do {
      const url = new URL(
        `/v0/users/${encodeURIComponent(config.username)}/collections`,
        config.apiUrl,
      );
      url.searchParams.set('subject_type', String(subjectType.id));
      url.searchParams.set('limit', String(BANGUMI_API_PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(`Bangumi API returned ${response.status}`);

      const payload = await response.json();
      const pageItems = Array.isArray(payload.data) ? payload.data : [];
      items.push(...pageItems);
      total = Number(payload.total) || items.length;
      if (pageItems.length === 0) break;
      offset += pageItems.length;
    } while (offset < total);

    return items;
  }

  async function loadSubjectType() {
    const requestedSubjectType = state.subjectType;
    renderLoading();
    try {
      if (!cache.has(requestedSubjectType.id)) {
        cache.set(
          requestedSubjectType.id,
          await fetchSubjectType(requestedSubjectType),
        );
      }
      if (state.subjectType.id !== requestedSubjectType.id) return;
      const loadedItems = cache.get(requestedSubjectType.id) || [];
      if (
        !loadedItems.some((item) => Number(item.type) === state.collectionType)
      ) {
        state.collectionType =
          BANGUMI_COLLECTION_TYPES.find((collectionType) =>
            loadedItems.some((item) => Number(item.type) === collectionType),
          ) || state.collectionType;
      }
      renderCollectionTabs();
      renderItems();
    } catch (error) {
      if (state.subjectType.id !== requestedSubjectType.id) return;
      console.error('[bangumi] Failed to load collection:', error);
      renderError();
    }
  }

  loadMoreButton.addEventListener('click', () => {
    state.visibleCount += BANGUMI_PAGE_SIZE;
    renderItems();
  });

  renderCategoryTabs();
  loadSubjectType();
}

document.querySelectorAll('.bgm-container').forEach(initBangumiCollection);

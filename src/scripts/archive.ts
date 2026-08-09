/** 静态归档页的多选筛选、草稿注入和视图切换。 */

import { escapeAttribute, escapeHtml, markdownBlocks } from './writer/markdown';
import { formatDisplayDomain, getPostExcerpt } from '@/helpers/post';
// 导入模块会注册串文折叠事件。
import { setThreadCollapsed } from './thread-collapse';
import { groupThreads, THREAD_COLLAPSE_FROM } from '@/helpers/threads';
import type { DraftSummary } from '@/domain/content-contract';

type Filters = Record<string, Set<string>>;

type AdminWindow = typeof window & { __lmdAdminAuthenticated?: boolean };

const closeMenus = (except?: HTMLElement) => {
  document
    .querySelectorAll<HTMLElement>('[data-chip-select]')
    .forEach((select) => {
      if (select === except) return;
      const menu = select.querySelector<HTMLElement>('[data-chip-menu]');
      const trigger = select.querySelector<HTMLElement>('[data-chip-trigger]');
      if (menu) menu.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    });
};

const applyDraftData = (element: HTMLElement, draft: DraftSummary) => {
  const date = draft.pubDate ? new Date(draft.pubDate) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  element.dataset.archiveItem = '';
  element.dataset.slug = draft.slug;
  element.dataset.month = 'drafts';
  element.dataset.year = validDate ? String(validDate.getFullYear()) : '';
  element.dataset.kind = draft.kind;
  element.dataset.collections = JSON.stringify(draft.collections);
  element.dataset.thread = String(Boolean(draft.thread));
  element.dataset.hasTitle = String(Boolean(draft.title));
  element.dataset.media = '';
  element.dataset.visibility = 'private';
  element.dataset.featured = String(draft.featured);
};

/**
 * 使用与 PostEntry.astro 一致的结构渲染草稿。
 * 修改正式条目结构时需要同步更新。
 */
const draftEntryMarkup = (
  draft: DraftSummary,
  editUrl: string,
  dateLabel: string,
  validDate: Date | null,
) => {
  const href = escapeAttribute(editUrl);
  const title = escapeHtml(draft.title);
  const bodyHtml = markdownBlocks(draft.body);
  const commentary = draft.commentary
    ? `<div class="home-entry-commentary"><p>${escapeHtml(draft.commentary)}</p></div>`
    : '';

  const flag = `
    <p class="home-entry-status">
      <span class="home-entry-status-badge home-entry-status-draft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        草稿
      </span>
    </p>`;

  let main: string;
  if (draft.kind === 'article') {
    main = `
      <div class="home-article">
        <h2 class="home-article-title"><a href="${href}">${title}</a></h2>
        <div class="home-entry-content home-article-content">${bodyHtml}</div>
      </div>`;
  } else if (draft.kind === 'link' && draft.externalUrl) {
    main = `
      <div>
        <div class="home-link-card">
          <span class="home-link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M14 5h5v5M19 5l-9 9" />
              <path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
            </svg>
          </span>
          <a class="home-link-url" href="${href}">${escapeHtml(formatDisplayDomain(draft.externalUrl))}</a>
          <a class="home-link-title" href="${href}">${title || escapeHtml(draft.externalUrl)}</a>
          <div class="home-entry-content">${bodyHtml}</div>
        </div>
        ${commentary}
      </div>`;
  } else if (draft.kind === 'quote') {
    const source = draft.source
      ? `<span class="home-entry-source">${escapeHtml(draft.source)}</span>`
      : '';
    main = `
      <div>
        <div class="home-quote-card">
          <span class="home-quote-mark" aria-hidden="true">“</span>
          ${title ? `<a class="home-entry-title" href="${href}">${title}</a>` : ''}
          <div class="home-entry-content">${bodyHtml}</div>
          ${source}
        </div>
        ${commentary}
      </div>`;
  } else {
    // 无标题内容只显示正文。
    main = `
      <div>
        ${title ? `<header class="home-entry-header"><a class="home-entry-title" href="${href}">${title}</a></header>` : ''}
        <div class="home-entry-content">${bodyHtml}</div>
        ${commentary}
      </div>`;
  }

  const rating = draft.rating
    ? `<span class="home-entry-rating"><span aria-hidden="true">${'★'.repeat(draft.rating)}${'☆'.repeat(5 - draft.rating)}</span><span class="sr-only">${draft.rating} 星评分</span></span>`
    : '';
  const stamp = validDate ? ` datetime="${validDate.toISOString()}"` : '';

  return `
    ${flag}
    ${main}
    <footer class="home-entry-footer">
      <a class="home-entry-date-link" href="${href}" aria-label="继续编辑这篇草稿">
        <time class="home-entry-date"${stamp}>${escapeHtml(dateLabel)}</time>
      </a>
      ${rating}
    </footer>`;
};

/** 使用正式内容相同的规则为草稿分组。 */
const groupDraftThreads = (drafts: DraftSummary[]) =>
  groupThreads(
    drafts,
    (draft) => draft.thread || undefined,
    (left, right) => left.pubDate.localeCompare(right.pubDate),
  );

const threadCollapse = () => {
  const template = document.querySelector<HTMLTemplateElement>(
    '[data-thread-collapse-template]',
  );
  const element = template?.content
    .querySelector<HTMLElement>('[data-thread-collapse]')
    ?.cloneNode(true) as HTMLElement | undefined;
  const shell = element?.querySelector<HTMLElement>('[data-thread-shell]');
  const button = element?.querySelector<HTMLElement>('[data-thread-toggle]');
  const label = element?.querySelector<HTMLElement>(
    '[data-thread-toggle-label]',
  );
  if (!element || !shell || !button || !label) return null;

  return {
    element,
    shell,
    setCount: (count: number) => {
      button.dataset.count = String(count);
      label.textContent = `显示其余 ${count} 条`;
    },
  };
};

const addDrafts = (body: HTMLElement, drafts: DraftSummary[]) => {
  const existing = new Set(
    [...body.querySelectorAll<HTMLElement>('[data-slug]')].map(
      (item) => item.dataset.slug,
    ),
  );
  const missing = drafts.filter((draft) => !existing.has(draft.slug));
  if (missing.length === 0) return;

  const grid = body.querySelector<HTMLElement>('[data-archive-grid]');
  const list = body.querySelector<HTMLElement>('[data-archive-list]');
  if (!grid || !list) return;

  const gridItems = document.createDocumentFragment();
  const header = document.createElement('div');
  header.className = 'archive-month-header archive-drafts-header';
  header.dataset.monthHeader = 'drafts';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'archive-month-header-label';
  headerLabel.textContent = '草稿';
  const headerCount = document.createElement('span');
  headerCount.className = 'archive-month-header-count';
  const count = document.createElement('span');
  count.dataset.monthCount = 'drafts';
  count.textContent = String(missing.length);
  headerCount.append(count, ' 条');
  header.append(headerLabel, headerCount);
  gridItems.append(header);

  const draftActions = (draft: DraftSummary) => {
    const template = document.querySelector<HTMLTemplateElement>(
      '[data-post-actions-template]',
    );
    const admin = template?.content
      .querySelector<HTMLElement>('.post-admin')
      ?.cloneNode(true) as HTMLElement | undefined;
    if (!admin) return null;

    admin.hidden = false;
    admin.dataset.postAdmin = draft.slug;
    admin.dataset.postCollections = JSON.stringify(draft.collections);
    admin.dataset.postVisibility = 'private';
    admin.dataset.postFeatured = String(draft.featured);
    admin.dataset.postPinned = 'false';

    const slug = encodeURIComponent(draft.slug);
    admin
      .querySelector('a.post-admin-btn')
      ?.setAttribute('href', `/write?reply=${slug}`);
    admin
      .querySelector('a.post-admin-row')
      ?.setAttribute('href', `/write?edit=${slug}`);

    // 根据草稿状态更新服务端生成的文案。
    const label = admin.querySelector<HTMLElement>('[data-visibility-label]');
    if (label) label.textContent = '草稿';
    const featured = admin.querySelector<HTMLElement>('[data-featured-label]');
    if (featured)
      featured.textContent = draft.featured ? '移出精选辑' : '加入精选辑';
    const pinned = admin.querySelector<HTMLElement>('[data-pinned-label]');
    if (pinned) pinned.textContent = '置顶';

    return admin;
  };

  const groupDivider = () => {
    const divider = document.createElement('div');
    divider.className = 'home-group-divider';
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  };

  const draftDate = (draft: DraftSummary) => {
    const date = draft.pubDate ? new Date(draft.pubDate) : null;
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
    return {
      validDate,
      label: validDate
        ? `${validDate.getMonth() + 1} 月 ${validDate.getDate()} 日`
        : '未标日期',
    };
  };

  missing.forEach((draft) => {
    const editUrl = `/write?edit=${encodeURIComponent(draft.slug)}`;
    const { validDate, label: dateLabel } = draftDate(draft);

    const tile = document.createElement('a');
    tile.className = 'archive-tile archive-draft-tile';
    tile.href = editUrl;
    applyDraftData(tile, draft);
    const top = document.createElement('div');
    top.className = 'archive-tile-top-meta';
    const time = document.createElement('time');
    time.className = 'archive-tile-date';
    time.textContent = dateLabel;
    if (validDate) time.dateTime = validDate.toISOString();
    top.append(time);
    const content = document.createElement('div');
    content.className = 'archive-tile-content';
    const copy = document.createElement('div');
    copy.className = 'archive-tile-copy';
    const title = document.createElement('span');
    title.className = 'archive-tile-title';
    title.textContent = draft.title || draft.slug;
    const summary = document.createElement('span');
    summary.className = 'archive-tile-summary';
    // 与正式方格使用相同的摘要长度。
    summary.textContent = getPostExcerpt(draft.body, 96) ?? '';
    copy.append(title, summary);
    content.append(copy);
    tile.append(top, content);
    gridItems.append(tile);
  });

  const draftArticle = (draft: DraftSummary) => {
    const editUrl = `/write?edit=${encodeURIComponent(draft.slug)}`;
    const { validDate, label } = draftDate(draft);
    const article = document.createElement('article');
    article.className = 'home-feed-item';
    applyDraftData(article, draft);
    article.innerHTML = draftEntryMarkup(draft, editUrl, label, validDate);
    const actions = draftActions(draft);
    if (actions) article.querySelector('.home-entry-footer')?.append(actions);
    return article;
  };

  // 草稿沿用正式条目的分组结构和样式。
  const listItems = document.createDocumentFragment();
  groupDraftThreads(missing).forEach((group, groupIndex) => {
    const row = document.createElement('div');
    row.className = 'home-feed-cluster archive-draft-row';
    // 筛选属性保留在条目上，cluster 仅负责分组。
    row.dataset.feedCluster = '';
    if (groupIndex > 0) row.append(groupDivider());

    const section = document.createElement('section');
    section.className = 'home-feed-group';
    section.dataset.visibleCount = String(group.items.length);
    if (group.thread) section.dataset.threadGroup = group.thread;

    const articles = group.items.map((draft, index) => {
      const article = draftArticle(draft);
      if (index === 0) article.classList.add('is-first-visible');
      if (index === group.items.length - 1) {
        article.classList.add('is-last-visible');
        if (group.thread) article.classList.add('is-thread-latest');
      }
      return article;
    });

    // 使用与 ThreadGroup.astro 相同的折叠阈值。
    const context = group.thread ? articles.slice(0, -1) : [];
    const collapse =
      context.length >= THREAD_COLLAPSE_FROM ? threadCollapse() : null;
    if (collapse) {
      collapse.shell.append(...context);
      collapse.setCount(context.length);
      section.append(collapse.element, ...articles.slice(-1));
    } else {
      section.append(...articles);
    }

    row.append(section);
    listItems.append(row);
  });

  grid.prepend(gridItems);
  list.prepend(listItems);

  // 草稿置顶后，为第一条正式内容补充分隔线。
  const firstOriginal = list.querySelector<HTMLElement>(
    '.home-feed-cluster:not(.archive-draft-row)',
  );
  if (firstOriginal && !firstOriginal.querySelector('.home-group-divider')) {
    firstOriginal.prepend(groupDivider());
  }
};

const loadDrafts = async (body: HTMLElement) => {
  const endpoint = body.dataset.draftsEndpoint;
  if (
    !endpoint ||
    body.dataset.draftsLoaded === 'true' ||
    body.dataset.draftsLoading === 'true'
  ) {
    return;
  }
  body.dataset.draftsLoading = 'true';
  try {
    const response = await fetch(endpoint, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = (await response.json()) as { drafts?: DraftSummary[] };
    addDrafts(body, result.drafts ?? []);
    body.dataset.draftsLoaded = 'true';
    body.dispatchEvent(
      new CustomEvent('lmd:archive-items-changed', { bubbles: true }),
    );
  } catch (error) {
    console.warn('草稿列表加载失败', error);
  } finally {
    delete body.dataset.draftsLoading;
  }
};

const setup = () => {
  const body = document.querySelector<HTMLElement>('[data-archive-body]');
  if (!body || body.dataset.archiveReady === 'true') return;
  body.dataset.archiveReady = 'true';

  let items = [...body.querySelectorAll<HTMLElement>('[data-archive-item]')];
  // 归档页按方格计数；合集页没有方格，改按列表计数。
  const hasTiles = items.some((item) =>
    item.classList.contains('archive-tile'),
  );
  const isCountable = (item: HTMLElement) =>
    !hasTiles || item.classList.contains('archive-tile');
  let monthHeaders = [
    ...body.querySelectorAll<HTMLElement>('[data-month-header]'),
  ];
  const countLabel = document.querySelector<HTMLElement>(
    '[data-archive-count]',
  );
  const empty = body.querySelector<HTMLElement>('[data-archive-empty]');
  const selects = [
    ...document.querySelectorAll<HTMLElement>('[data-chip-select]'),
  ];

  const filters: Filters = {};
  const selected = (name: string) => {
    filters[name] ??= new Set<string>();
    return filters[name]!;
  };
  const passes = (name: string, values: string[]) => {
    const chosen = selected(name);
    return chosen.size === 0 || values.some((value) => chosen.has(value));
  };

  const readCollections = (item: HTMLElement) => {
    try {
      return JSON.parse(item.dataset.collections || '[]') as string[];
    } catch {
      return [];
    }
  };

  const apply = () => {
    let visible = 0;

    items.forEach((item) => {
      const media = (item.dataset.media || '').split(',').filter(Boolean);
      // article 同时归入 note 和 note:titled。
      const kindValues = [item.dataset.kind ?? ''];
      if (item.dataset.kind === 'note' || item.dataset.kind === 'article') {
        kindValues.push(
          'note',
          item.dataset.hasTitle === 'true' ? 'note:titled' : 'note:untitled',
        );
      }
      const mediaValues = media;
      const visibilityValues = [item.dataset.visibility ?? ''];
      if (item.dataset.featured === 'true') visibilityValues.push('featured');

      const matches =
        passes('year', [item.dataset.year ?? '']) &&
        passes('kind', kindValues) &&
        passes('collection', readCollections(item)) &&
        passes('thread', [
          item.dataset.thread === 'true' ? 'thread' : 'single',
        ]) &&
        passes('media', mediaValues) &&
        passes('visibility', visibilityValues);
      item.hidden = !matches;
      // 每条内容只计数一次。
      if (matches && isCountable(item)) visible += 1;
    });

    // 隐藏空月份并更新月度计数。
    monthHeaders.forEach((header) => {
      const key = header.dataset.monthHeader;
      const shown = items.filter(
        (item) =>
          item.dataset.month === key && isCountable(item) && !item.hidden,
      ).length;
      header.hidden = shown === 0;
      const counter = header.querySelector<HTMLElement>(
        `[data-month-count="${key}"]`,
      );
      if (counter) counter.textContent = String(shown);
    });

    // 筛选后重新计算串文轨道、末条标记和分组可见性。
    let shownClusters = 0;
    body
      .querySelectorAll<HTMLElement>('[data-feed-cluster]')
      .forEach((cluster) => {
        const group = cluster.querySelector<HTMLElement>('.home-feed-group');
        const members = [
          ...cluster.querySelectorAll<HTMLElement>('[data-archive-item]'),
        ];
        const shown = members.filter((member) => !member.hidden);

        if (group) group.dataset.visibleCount = String(shown.length);
        members.forEach((member) =>
          member.classList.remove('is-thread-latest'),
        );
        if (group?.dataset.threadGroup && shown.length > 1) {
          shown.at(-1)?.classList.add('is-thread-latest');
        }

        // 折叠段随内容一起筛选，避免留下空按钮。
        const collapse = cluster.querySelector<HTMLElement>(
          '[data-thread-collapse]',
        );
        if (collapse) {
          const inside = members.filter((member) => collapse.contains(member));
          collapse.hidden = inside.every((member) => member.hidden);
          // 外部条目全部隐藏时自动展开折叠段。
          const orphaned =
            !collapse.hidden &&
            members
              .filter((member) => !collapse.contains(member))
              .every((member) => member.hidden);
          const shell = collapse.querySelector<HTMLElement>(
            '[data-thread-shell]',
          );
          if (orphaned) {
            // 仅回收由筛选自动展开的折叠段。
            if (shell?.hasAttribute('data-collapsed')) {
              collapse.dataset.autoExpanded = '';
              setThreadCollapsed(collapse, false);
            }
          } else if (collapse.dataset.autoExpanded !== undefined) {
            delete collapse.dataset.autoExpanded;
            setThreadCollapsed(collapse, true);
          }
        }

        cluster.hidden = shown.length === 0;
        if (cluster.hidden) return;
        const divider = cluster.querySelector<HTMLElement>(
          '.home-group-divider',
        );
        if (divider) divider.hidden = shownClusters === 0;
        shownClusters += 1;
      });

    if (countLabel) countLabel.textContent = String(visible);
    if (empty) empty.hidden = visible > 0;
  };

  // 收集各维度的重置函数，供空状态按钮统一调用。
  const resetters: Array<() => void> = [];

  selects.forEach((select) => {
    const name = select.dataset.chipSelect ?? '';
    const trigger = select.querySelector<HTMLButtonElement>(
      '[data-chip-trigger]',
    );
    const menu = select.querySelector<HTMLElement>('[data-chip-menu]');
    const label = select.querySelector<HTMLElement>('[data-chip-label]');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = menu.hidden;
      closeMenus(select);
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });

    const clear = select.querySelector<HTMLButtonElement>('[data-chip-clear]');
    const options = [
      ...menu.querySelectorAll<HTMLButtonElement>('[data-chip-value]'),
    ];

    const syncChip = () => {
      const chosen = selected(name);
      options.forEach((option) => {
        const value = option.dataset.chipValue ?? '';
        const isDefault = option.dataset.chipDefault === 'true';
        const active = isDefault ? chosen.size === 0 : chosen.has(value);
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', String(active));
      });

      if (label) {
        if (chosen.size === 0) {
          label.textContent = '';
          label.hidden = true;
        } else if (chosen.size === 1) {
          const only = [...chosen][0];
          label.textContent =
            options
              .find((option) => option.dataset.chipValue === only)
              ?.querySelector('.archive-chip-option-label')
              ?.textContent?.trim() ?? '';
          label.hidden = false;
        } else {
          label.textContent = String(chosen.size);
          label.hidden = false;
        }
      }
      select.classList.toggle('is-active', chosen.size > 0);
      if (clear) clear.hidden = chosen.size === 0;
      const chevron = trigger.querySelector<HTMLElement>(
        '.archive-chip-chevron',
      );
      if (chevron) chevron.hidden = chosen.size > 0;
    };

    options.forEach((option) => {
      option.addEventListener('click', () => {
        const value = option.dataset.chipValue ?? '';
        const chosen = selected(name);
        // 总入口清空当前维度，其他选项独立切换。
        if (option.dataset.chipDefault === 'true') chosen.clear();
        else if (chosen.has(value)) chosen.delete(value);
        else chosen.add(value);

        syncChip();
        apply();
        // 多选时保持菜单打开。
        if (option.dataset.chipDefault === 'true') {
          menu.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    });

    clear?.addEventListener('click', (event) => {
      event.stopPropagation();
      selected(name).clear();
      syncChip();
      apply();
    });

    resetters.push(() => {
      selected(name).clear();
      syncChip();
    });

    syncChip();
  });

  const clearAll = body.querySelector<HTMLButtonElement>(
    '[data-archive-clear-filters]',
  );
  clearAll?.addEventListener('click', () => {
    resetters.forEach((reset) => reset());
    apply();
  });

  document
    .querySelectorAll<HTMLButtonElement>('[data-archive-view]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        body.dataset.view = button.dataset.archiveView ?? 'grid';
        document
          .querySelectorAll<HTMLButtonElement>('[data-archive-view]')
          .forEach((other) => {
            const active = other === button;
            other.classList.toggle('is-active', active);
            other.setAttribute('aria-pressed', String(active));
          });
      });
    });

  body.addEventListener('lmd:archive-items-changed', () => {
    items = [...body.querySelectorAll<HTMLElement>('[data-archive-item]')];
    monthHeaders = [
      ...body.querySelectorAll<HTMLElement>('[data-month-header]'),
    ];
    apply();
  });

  apply();
  if ((window as AdminWindow).__lmdAdminAuthenticated) void loadDrafts(body);
};

// document 级监听不受软导航影响，只注册一次。
document.addEventListener('click', () => closeMenus());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus();
});
document.addEventListener('lmd:admin-authenticated', () => {
  const body = document.querySelector<HTMLElement>('[data-archive-body]');
  if (body) void loadDrafts(body);
});
setup();
document.addEventListener('astro:page-load', setup);

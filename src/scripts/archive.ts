/**
 * 归档页：图标胶囊筛选（自绘下拉，不用原生 select）+ 方格/列表切换。
 *
 * jant 的 /archive 用 URL 参数在服务端筛，本站是静态输出，所以改成前端筛：
 * 数据本来就全在页面里，切换零延迟，也不用为每种组合生成页面。
 */

/** 每个筛选维度保存一组已选值 —— 筛选是多选的（同 jant，胶囊上显示计数 + 清除） */
type Filters = Record<string, Set<string>>;

interface DraftSummary {
  slug: string;
  title: string;
  kind: string;
  pubDate: string;
  collections: string[];
  thread: boolean;
  featured: boolean;
}

type AdminWindow = typeof window & { __lmdAdminAuthenticated?: boolean };

/** 模块只注册一组全局监听；软导航再多次也不会叠加。 */
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
  element.dataset.thread = String(draft.thread);
  element.dataset.hasTitle = String(Boolean(draft.title));
  element.dataset.media = '';
  element.dataset.visibility = 'private';
  element.dataset.featured = String(draft.featured);
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

  /** 列表视图里正常条目的分隔标记，草稿行沿用同一个 */
  const groupDivider = () => {
    const divider = document.createElement('div');
    divider.className = 'home-group-divider';
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  };

  const listItems = document.createDocumentFragment();
  missing.forEach((draft, listIndex) => {
    const editUrl = `/write?edit=${encodeURIComponent(draft.slug)}`;
    const date = draft.pubDate ? new Date(draft.pubDate) : null;
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
    const dateLabel = validDate
      ? `${validDate.getMonth() + 1} 月 ${validDate.getDate()} 日`
      : '未标日期';

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
    summary.textContent = '草稿 · 点击继续编辑';
    copy.append(title, summary);
    content.append(copy);
    tile.append(top, content);
    gridItems.append(tile);

    /*
     * 列表视图的草稿照搬正常条目的结构（archive.astro 里那套
     * cluster > divider? + group > article.home-feed-item），
     * 这样标题、日期、间距全都走首页那份样式，不用另写一套。
     * 原来是一行虚线加「日期 · 草稿 · 点击继续编辑」，和上下条目不是一个语言。
     */
    const row = document.createElement('div');
    row.className = 'home-feed-cluster archive-draft-row';
    applyDraftData(row, draft);
    if (listIndex > 0) row.append(groupDivider());

    const group = document.createElement('section');
    group.className = 'home-feed-group';
    group.dataset.visibleCount = '1';

    const article = document.createElement('article');
    article.className = 'home-feed-item is-first-visible is-last-visible';

    const header = document.createElement('header');
    header.className = 'home-entry-header';
    const rowTitle = document.createElement('a');
    rowTitle.className = 'home-entry-title';
    rowTitle.href = editUrl;
    rowTitle.textContent = draft.title || draft.slug;
    header.append(rowTitle);

    const footer = document.createElement('footer');
    footer.className = 'home-entry-footer';
    const dateLink = document.createElement('a');
    dateLink.className = 'home-entry-date-link';
    dateLink.href = editUrl;
    const rowTime = document.createElement('time');
    rowTime.className = 'home-entry-date';
    rowTime.textContent = dateLabel;
    if (validDate) rowTime.dateTime = validDate.toISOString();
    dateLink.append(rowTime);
    const flag = document.createElement('span');
    flag.className = 'archive-draft-flag';
    flag.textContent = '草稿';
    footer.append(dateLink, flag);

    article.append(header, footer);
    group.append(article);
    row.append(group);
    listItems.append(row);
  });

  grid.prepend(gridItems);
  list.prepend(listItems);

  // 草稿插到最前面之后，原本的第一条不再是第一条了，给它补上分隔标记，
  // 否则草稿和正文之间会少一条，节奏断在那儿。
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
    body.dispatchEvent(new CustomEvent('lmd:archive-items-changed'));
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
  /**
   * 归档页同一条内容有方格和列表两份 DOM，计数只能认其中一份（方格）。
   * 合集页只有列表、没有方格，所以按"有没有方格"决定认哪一份。
   */
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
  /** 多选：没选任何一项就是「全部」；选了就看有没有交集 */
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
      // 形式的可选值含 `note:titled` / `note:untitled` 这种带子级的写法。
      // 长文（article）就是带标题的随记，所以也归到 note / note:titled 下。
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
      // 方格视图里每条只算一次（列表视图有同样一份，不重复计数）
      if (matches && isCountable(item)) visible += 1;
    });

    // 整月被筛空就把月份标题也收起来，并更新每月计数
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

    // 列表视图里第一条可见项之前不该有分隔点
    const listVisible = items.filter(
      (item) => item.classList.contains('home-feed-cluster') && !item.hidden,
    );
    listVisible.forEach((item, index) => {
      const divider = item.querySelector<HTMLElement>('.home-group-divider');
      if (divider) divider.hidden = index === 0;
    });

    if (countLabel) countLabel.textContent = String(visible);
    if (empty) empty.hidden = visible > 0;
  };

  /** 空状态里那颗「清除筛选」按钮要一次性清空所有维度，
      而每个维度的 syncChip 是闭包里的，这里收集起来统一调用。 */
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

    /** 胶囊上：选 1 项显示文字，选多项显示计数，选了就露出清除按钮 */
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
        // 「全部 X」这一项是清空入口，其余项各自切换
        if (option.dataset.chipDefault === 'true') chosen.clear();
        else if (chosen.has(value)) chosen.delete(value);
        else chosen.add(value);

        syncChip();
        apply();
        // 多选时保持菜单打开，方便连着勾
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

  /** 筛选到空结果时，给一个一键回到全部的出口，不用逐个胶囊点回去 */
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

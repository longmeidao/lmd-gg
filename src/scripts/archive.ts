/**
 * 归档页：图标胶囊筛选（自绘下拉，不用原生 select）+ 方格/列表切换。
 *
 * jant 的 /archive 用 URL 参数在服务端筛，本站是静态输出，所以改成前端筛：
 * 数据本来就全在页面里，切换零延迟，也不用为每种组合生成页面。
 */

/** 每个筛选维度保存一组已选值 —— 筛选是多选的（同 jant，胶囊上显示计数 + 清除） */
type Filters = Record<string, Set<string>>;

const setup = () => {
  const body = document.querySelector<HTMLElement>('[data-archive-body]');
  if (!body || body.dataset.archiveReady === 'true') return;
  body.dataset.archiveReady = 'true';

  const items = [...body.querySelectorAll<HTMLElement>('[data-archive-item]')];
  /**
   * 归档页同一条内容有方格和列表两份 DOM，计数只能认其中一份（方格）。
   * 合集页只有列表、没有方格，所以按"有没有方格"决定认哪一份。
   */
  const hasTiles = items.some((item) => item.classList.contains('archive-tile'));
  const isCountable = (item: HTMLElement) =>
    !hasTiles || item.classList.contains('archive-tile');
  const monthHeaders = [
    ...body.querySelectorAll<HTMLElement>('[data-month-header]'),
  ];
  const countLabel = document.querySelector<HTMLElement>('[data-archive-count]');
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

  const closeMenus = (except?: HTMLElement) => {
    selects.forEach((select) => {
      if (select === except) return;
      const menu = select.querySelector<HTMLElement>('[data-chip-menu]');
      const trigger = select.querySelector<HTMLElement>('[data-chip-trigger]');
      if (menu) menu.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    });
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
      const media = (item.dataset.media || '')
        .split(',')
        .filter(Boolean);
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

    syncChip();
  });

  document.addEventListener('click', () => closeMenus());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenus();
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

  apply();
};

setup();
document.addEventListener('astro:page-load', setup);

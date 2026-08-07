/**
 * 归档页：图标胶囊筛选（自绘下拉，不用原生 select）+ 方格/列表切换。
 *
 * jant 的 /archive 用 URL 参数在服务端筛，本站是静态输出，所以改成前端筛：
 * 数据本来就全在页面里，切换零延迟，也不用为每种组合生成页面。
 */

import { escapeAttribute, escapeHtml, markdownBlocks } from './writer/markdown';
// 纯 TS、无 Astro 依赖，正文摘要和服务端渲染的方格共用同一套规则
import { formatDisplayDomain, getPostExcerpt } from '@/helpers/post';
// 顺带把折叠段的点击监听装上（模块自带副作用），列表视图里的串文要用
import { setThreadCollapsed } from './thread-collapse';
import { groupThreads, THREAD_COLLAPSE_FROM } from '@/helpers/threads';
import type { DraftSummary } from '@/domain/content-contract';

/** 每个筛选维度保存一组已选值——筛选是多选的（同 jant，胶囊上显示计数 + 清除） */
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
 * 把一条草稿画成和首页一样的 feed 条目：结构照抄 PostEntry.astro 的分支，
 * 类名沿用，样式全来自 home.css。草稿不进静态构建，只能在前端补画——
 * 改 PostEntry 的结构时这里要跟着改。
 *
 * 唯一多出来的是顶部那枚「草稿」标记，复用置顶标记的 .home-entry-status。
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
    // 无标题就不造标题，和首页一致：只显示正文
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

/** 草稿按串文分组：和生产端 helpers/content 的 groupPostThreads 同一套规则 */
const groupDraftThreads = (drafts: DraftSummary[]) =>
  groupThreads(
    drafts,
    (draft) => draft.thread || undefined,
    (left, right) => left.pubDate.localeCompare(right.pubDate),
  );

/**
 * 折叠段的 markup 不在这里重写一遍：页面上放了一份
 * components/feed/ThreadCollapse.astro 渲染出的模板，克隆它就行
 * （同 PostActions 的做法），样式和交互自然跟服务端那份一模一样。
 */
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

  /**
   * 给草稿配一份操作菜单：克隆页面里那份 PostActions 模板，再把 slug 和
   * 状态属性改成这条草稿的。模板里的那份是 hidden 的（组件默认如此），
   * 但能走到这儿说明已经登录，克隆出来直接放出。
   */
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

    // 这几处文案服务端是按 props 渲染的，克隆出来要按草稿的状态改写
    const label = admin.querySelector<HTMLElement>('[data-visibility-label]');
    if (label) label.textContent = '草稿';
    const featured = admin.querySelector<HTMLElement>('[data-featured-label]');
    if (featured)
      featured.textContent = draft.featured ? '移出精选辑' : '加入精选辑';
    const pinned = admin.querySelector<HTMLElement>('[data-pinned-label]');
    if (pinned) pinned.textContent = '置顶';

    return admin;
  };

  /** 列表视图里正常条目的分隔标记，草稿行沿用同一个 */
  const groupDivider = () => {
    const divider = document.createElement('div');
    divider.className = 'home-group-divider';
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  };

  /** 条目的日期在方格和列表里显示成一样的短日期 */
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
    // 和正常方格一样显示正文摘要（archive.astro 用的也是 96 字上限）
    summary.textContent = getPostExcerpt(draft.body, 96) ?? '';
    copy.append(title, summary);
    content.append(copy);
    tile.append(top, content);
    gridItems.append(tile);
  });

  /** 列表视图里的一条：结构照搬 components/feed/PostEntry.astro 的 <article> */
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

  // 列表视图的草稿照搬正常条目的结构（cluster > divider? + group > article），
  // 标题、日期、间距全走首页那份样式，不用另写一套
  const listItems = document.createDocumentFragment();
  groupDraftThreads(missing).forEach((group, groupIndex) => {
    const row = document.createElement('div');
    row.className = 'home-feed-cluster archive-draft-row';
    // 筛选标记挂在条目上（同正常条目），cluster 只做分组容器
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

    // 前面那几条折起来，规则和 ThreadGroup.astro 一致（两条起才折）
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
  // 归档页同一条内容有方格和列表两份 DOM，计数只能认其中一份（方格）。
  // 合集页只有列表、没有方格，所以按「有没有方格」决定认哪一份。
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

    /*
     * 列表视图按串文成组，所以筛选之后要重算每组的状态：
     * - data-visible-count 决定 CSS 画不画轨道（只剩一条就不该画）
     * - is-thread-latest 那颗大锚点要落在「当前可见的最后一条」上
     * - 整组被筛空就连 cluster 一起收起来，分隔点也跟着让位
     */
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

        // 串文折起来的那一截也得跟着筛选走，否则会剩下一个指向空处的按钮
        const collapse = cluster.querySelector<HTMLElement>(
          '[data-thread-collapse]',
        );
        if (collapse) {
          const inside = members.filter((member) => collapse.contains(member));
          collapse.hidden = inside.every((member) => member.hidden);
          // 反过来，露在外面的最新那条被筛掉了：展开，不然整组只看得见一个按钮
          const orphaned =
            !collapse.hidden &&
            members
              .filter((member) => !collapse.contains(member))
              .every((member) => member.hidden);
          const shell = collapse.querySelector<HTMLElement>(
            '[data-thread-shell]',
          );
          if (orphaned) {
            // 记一笔是筛选替他展开的，清掉筛选就该收回去；本来就展开着的不碰
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

  // 空状态里那颗「清除筛选」按钮要一次性清空所有维度，
  // 而每个维度的 syncChip 是闭包里的，这里收集起来统一调用
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

// document 级监听：模块只求值一次，软导航再多次也不会叠加
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

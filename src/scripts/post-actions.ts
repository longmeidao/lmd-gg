/**
 * 首页 / 详情页条目上的管理操作：回复、编辑、加入合集、可见性、复制链接、删除。
 *
 * 写接口是「整份 markdown 读回来 → 改 frontmatter → 写回去」，
 * 所以这里只对 frontmatter 做定点增删，正文原样保留。
 */

import { DEFAULT_COLLECTION } from '@/helpers/collection';

type Visibility = 'public' | 'hidden' | 'private';

const sessionKey = 'lmd:admin-secret:session';
const persistentKey = 'lmd:admin-secret:persistent';
const isLocalWriter = import.meta.env.DEV;
const writeEndpoint = isLocalWriter ? '/__lmd/write' : '/api/admin/posts';

const getSecret = () =>
  sessionStorage.getItem(sessionKey) ||
  localStorage.getItem(persistentKey) ||
  '';

const authHeaders = (): Record<string, string> => {
  const secret = getSecret();
  return secret ? { authorization: `Bearer ${secret}` } : {};
};

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: '公开',
  hidden: '不在最新',
  private: '草稿',
};

/** 站点上出现过的所有合集：条目自带的 + 首页筛选栏里的 */
const knownCollections = () => {
  const names = new Set<string>();
  document
    .querySelectorAll<HTMLElement>('[data-post-admin]')
    .forEach((element) => {
      try {
        (JSON.parse(element.dataset.postCollections || '[]') as string[]).forEach(
          (tag) => names.add(tag),
        );
      } catch {
        /* 忽略坏掉的属性 */
      }
    });
  // 首页筛选栏的第一颗是「全部文章」，那是伪合集，跳过
  [...document.querySelectorAll<HTMLElement>('[data-collection-filter]')]
    .slice(1)
    .forEach((button) => {
      const name = button.dataset.collectionFilter;
      if (name) names.add(name);
    });
  // 兜底合集只是展示用的，不是真合集，不能写进 frontmatter
  names.delete(DEFAULT_COLLECTION);
  return [...names].sort((left, right) => left.localeCompare(right, 'zh-CN'));
};

const splitFrontmatter = (content: string) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('这篇内容的 Frontmatter 无法识别。');
  return { lines: match[1]!.split('\n'), body: match[2]! };
};

const joinPost = (lines: string[], body: string) =>
  `---\n${lines.filter((line) => line !== null).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;

/** 删掉某个顶层 key（含 `collections:` 这种带缩进列表的块） */
const dropKey = (lines: string[], key: string) => {
  const result: string[] = [];
  let skippingBlock = false;
  for (const line of lines) {
    if (skippingBlock) {
      if (/^\s+-\s+/.test(line) || line.trim() === '') continue;
      skippingBlock = false;
    }
    if (new RegExp(`^${key}:`).test(line)) {
      skippingBlock = key === 'collections';
      continue;
    }
    result.push(line);
  }
  return result;
};

const setCollections = (content: string, names: string[]) => {
  const { lines, body } = splitFrontmatter(content);
  const next = dropKey(lines, 'collections');
  if (names.length) next.push(`collections: ${JSON.stringify(names)}`);
  return joinPost(next, body);
};

const setVisibility = (content: string, visibility: Visibility) => {
  const { lines, body } = splitFrontmatter(content);
  const next = dropKey(dropKey(lines, 'hiddenFromLatest'), 'draft');
  const hasPubDate = next.some((line) => /^pubDate:/.test(line));

  if (visibility === 'hidden') next.push('hiddenFromLatest: true');
  if (visibility === 'private') {
    next.push('draft: true');
  } else if (!hasPubDate) {
    // schema 要求非草稿必须有 pubDate
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Taipei',
    }).format(new Date());
    next.push(`pubDate: ${today}`);
  }
  return joinPost(next, body);
};

/** 精选 / 置顶都是布尔开关：开就写 `key: true`，关就把这行删掉 */
const setFlag = (content: string, key: 'featured' | 'pinned', on: boolean) => {
  const { lines, body } = splitFrontmatter(content);
  const next = dropKey(lines, key);
  if (on) next.push(`${key}: true`);
  return joinPost(next, body);
};

const readPost = async (slug: string) => {
  const response = await fetch(
    `${writeEndpoint}?slug=${encodeURIComponent(slug)}`,
    { headers: authHeaders() },
  );
  const result = (await response.json().catch(() => ({}))) as {
    content?: string;
    error?: string;
  };
  if (!response.ok || !result.content) {
    throw new Error(result.error || '无法读取这篇内容。');
  }
  return result.content;
};

const writePost = async (slug: string, content: string) => {
  const response = await fetch(writeEndpoint, {
    method: 'PUT',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ posts: [{ slug, content }] }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(result.error || '保存失败。');
  }
};

const deletePost = async (slug: string) => {
  const response = await fetch(
    `${writeEndpoint}?slug=${encodeURIComponent(slug)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(result.error || '删除失败。');
  }
};

const closeAllMenus = (except?: HTMLElement) => {
  document.querySelectorAll<HTMLElement>('[data-post-menu]').forEach((menu) => {
    if (menu === except) return;
    const popover = menu.querySelector<HTMLElement>('[data-post-menu-popover]');
    const trigger = menu.querySelector<HTMLElement>('[data-post-menu-trigger]');
    if (popover) popover.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  });
};

const setupPostActions = (root: HTMLElement) => {
  if (root.dataset.postActionsReady === 'true') return;
  root.dataset.postActionsReady = 'true';

  const slug = root.dataset.postAdmin ?? '';
  const menu = root.querySelector<HTMLElement>('[data-post-menu]');
  const trigger = root.querySelector<HTMLButtonElement>(
    '[data-post-menu-trigger]',
  );
  const popover = root.querySelector<HTMLElement>('[data-post-menu-popover]');
  const collectionOptions = root.querySelector<HTMLElement>(
    '[data-collection-options]',
  );
  const visibilityLabel = root.querySelector<HTMLElement>(
    '[data-visibility-label]',
  );
  if (!menu || !trigger || !popover || !collectionOptions) return;

  const currentCollections = () => {
    try {
      return JSON.parse(root.dataset.postCollections || '[]') as string[];
    } catch {
      return [];
    }
  };

  const showPane = (name: string) => {
    popover
      .querySelectorAll<HTMLElement>('[data-pane]')
      .forEach((pane) => (pane.hidden = pane.dataset.pane !== name));
  };

  const renderCollectionOptions = () => {
    const selected = currentCollections();
    const names = [...new Set([...knownCollections(), ...selected])];
    collectionOptions.innerHTML = names.length
      ? names
          .map(
            (name) => `
              <button type="button" class="post-admin-row" data-toggle-collection="${name.replaceAll('"', '&quot;')}" aria-pressed="${selected.includes(name)}">
                <span>${name.replaceAll('<', '&lt;')}</span>
                <svg class="post-admin-check" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 9.2 3 3 6-6.4"/></svg>
              </button>`,
          )
          .join('')
      : '<p class="post-admin-empty">还没有合集。</p>';
  };

  const syncVisibility = () => {
    const visibility = (root.dataset.postVisibility || 'public') as Visibility;
    if (visibilityLabel)
      visibilityLabel.textContent = VISIBILITY_LABELS[visibility];
    root
      .querySelectorAll<HTMLButtonElement>('[data-set-visibility]')
      .forEach((button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.setVisibility === visibility),
        );
      });
  };

  const openMenu = (open: boolean) => {
    popover.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      closeAllMenus(menu);
      showPane('root');
      renderCollectionOptions();
      syncVisibility();
    }
  };

  const withPost = async (
    label: string,
    change: (content: string) => string,
  ) => {
    trigger.disabled = true;
    try {
      const content = await readPost(slug);
      await writePost(slug, change(content));
      window.location.reload();
    } catch (error) {
      trigger.disabled = false;
      window.alert(
        `${label}失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(Boolean(popover.hidden));
  });

  popover.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const paneButton = target.closest<HTMLButtonElement>('[data-goto-pane]');
    if (paneButton) {
      showPane(paneButton.dataset.gotoPane ?? 'root');
      return;
    }

    const copyButton = target.closest<HTMLButtonElement>('[data-copy-post-link]');
    if (copyButton) {
      const path = copyButton.dataset.copyPostLink;
      if (!path) return;
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).href,
      );
      const label = copyButton.querySelector('span');
      if (label) {
        label.textContent = '已复制';
        window.setTimeout(() => {
          label.textContent = '复制链接';
        }, 1200);
      }
      return;
    }

    const collectionButton = target.closest<HTMLButtonElement>(
      '[data-toggle-collection]',
    );
    if (collectionButton) {
      const name = collectionButton.dataset.toggleCollection ?? '';
      const next = currentCollections().includes(name)
        ? currentCollections().filter((item) => item !== name)
        : [...currentCollections(), name];
      await withPost('更新合集', (content) =>
        setCollections(content, next),
      );
      return;
    }

    if (target.closest('[data-new-collection]')) {
      const name = window.prompt('新的合集名称')?.trim();
      if (!name) return;
      const next = [...new Set([...currentCollections(), name])];
      await withPost('更新合集', (content) =>
        setCollections(content, next),
      );
      return;
    }

    if (target.closest('[data-toggle-featured]')) {
      const on = root.dataset.postFeatured !== 'true';
      await withPost(on ? '加入精选' : '取消精选', (content) =>
        setFlag(content, 'featured', on),
      );
      return;
    }

    if (target.closest('[data-toggle-pinned]')) {
      const on = root.dataset.postPinned !== 'true';
      await withPost(on ? '置顶' : '取消置顶', (content) =>
        setFlag(content, 'pinned', on),
      );
      return;
    }

    const visibilityButton = target.closest<HTMLButtonElement>(
      '[data-set-visibility]',
    );
    if (visibilityButton) {
      const next = visibilityButton.dataset.setVisibility as Visibility;
      await withPost('修改可见性', (content) => setVisibility(content, next));
      return;
    }

    if (target.closest('[data-delete-post]')) {
      if (!window.confirm(`确定删除「${slug}」？此操作不可撤销。`)) return;
      trigger.disabled = true;
      try {
        await deletePost(slug);
        window.location.reload();
      } catch (error) {
        trigger.disabled = false;
        window.alert(
          `删除失败：${error instanceof Error ? error.message : '未知错误'}`,
        );
      }
    }
  });
};

const init = () => {
  document
    .querySelectorAll<HTMLElement>('[data-post-admin]')
    .forEach(setupPostActions);
};

document.addEventListener('click', () => closeAllMenus());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllMenus();
});
document.addEventListener('lmd:admin-authenticated', init);
// ClientRouter 换页后是新的 DOM 节点，要重新挂事件
document.addEventListener('astro:page-load', init);
init();

/**
 * 串文折叠段的展开/收起。
 *
 * 监听挂在 document 上，只绑一次：ClientRouter 换页后 DOM 是全新的，
 * 抓死元素引用会让软跳转过去的页面点了没反应（同 search / post-actions 的处理）。
 */

const EXPANDED_LABEL = '收起';
/** 折叠时朝下、展开后朝上 */
const CHEVRON_DOWN = 'M4 6l4 4 4-4';
const CHEVRON_UP = 'M4 10l4-4 4 4';

/** 设定某一段的折叠状态。归档筛选也要用，所以单独导出。 */
export const setThreadCollapsed = (
  wrapper: HTMLElement,
  collapsed: boolean,
) => {
  const shell = wrapper.querySelector<HTMLElement>('[data-thread-shell]');
  const button = wrapper.querySelector<HTMLElement>('[data-thread-toggle]');
  if (!shell || !button) return;
  if (collapsed) shell.setAttribute('data-collapsed', '');
  else shell.removeAttribute('data-collapsed');

  button.setAttribute('aria-expanded', String(!collapsed));
  // 只换文字节点：按钮里还有那枚三角，整个 textContent 会把它抹掉
  const label = button.querySelector<HTMLElement>('[data-thread-toggle-label]');
  if (label) {
    label.textContent = collapsed
      ? `显示其余 ${button.dataset.count ?? ''} 条`
      : EXPANDED_LABEL;
  }
  button
    .querySelector('[data-thread-toggle-chevron]')
    ?.setAttribute('d', collapsed ? CHEVRON_DOWN : CHEVRON_UP);
};

const toggleShell = (button: HTMLElement) => {
  const wrapper = button.closest<HTMLElement>('[data-thread-collapse]');
  const shell = wrapper?.querySelector<HTMLElement>('[data-thread-shell]');
  if (!wrapper || !shell) return;
  // 手动动过之后，归档筛选就别再替他收起来了（见 scripts/archive.ts）
  delete wrapper.dataset.autoExpanded;
  setThreadCollapsed(wrapper, !shell.hasAttribute('data-collapsed'));
};

if (
  !(window as typeof window & { __lmdThreadCollapse?: boolean })
    .__lmdThreadCollapse
) {
  (
    window as typeof window & { __lmdThreadCollapse?: boolean }
  ).__lmdThreadCollapse = true;
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-thread-toggle]',
    );
    if (button) toggleShell(button);
  });
}

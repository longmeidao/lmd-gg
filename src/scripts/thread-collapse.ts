/** 通过 document 事件委托处理软导航后的串文折叠。 */

const EXPANDED_LABEL = '收起';
/** 折叠时向下，展开时向上。 */
const CHEVRON_DOWN = 'M4 6l4 4 4-4';
const CHEVRON_UP = 'M4 10l4-4 4 4';

/** 设置折叠状态，供归档筛选复用。 */
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
  // 仅更新标签，保留按钮内的图标。
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
  // 手动操作后停止自动调整。
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

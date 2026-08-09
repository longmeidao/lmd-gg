import Heti from 'heti/js/heti-addon.js';

/** 同步处理并标记根节点，避免软导航重复添加 Heti 包装。 */
const heti = new Heti();

export const spaceOnce = (selector: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((root) => {
    if (root.dataset.hetiDone === 'true') return;
    root.dataset.hetiDone = 'true';
    heti.spacingElement(root);
  });
};

/** 软导航后重新处理中西文间距。 */
const applySpacing = () => {
  spaceOnce('.home-entry-content, .home-entry-date');
};

applySpacing();
document.addEventListener('astro:page-load', applySpacing);

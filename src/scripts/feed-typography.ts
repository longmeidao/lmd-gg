import Heti from 'heti/js/heti-addon.js';

/**
 * heti 的 autoSpacing() 会等下一轮事件循环才查 DOM，没法靠选择器防重复；
 * 改为逐个根节点同步处理，处理过的打上标记。
 *
 * 之所以要防重复：`astro:page-load` 在首次加载时也会触发，跑第二遍会把
 * 已经生成好的 <heti-adjacent> 再裹一层（heti 的跳过表漏掉了这个标签），
 * 句尾标点就被压扁两次。
 */
const heti = new Heti();

export const spaceOnce = (selector: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((root) => {
    if (root.dataset.hetiDone === 'true') return;
    root.dataset.hetiDone = 'true';
    heti.spacingElement(root);
  });
};

/** 首页/合集页的中西混排。ClientRouter 换页后 DOM 是新的，需要重新处理一遍 */
const applySpacing = () => {
  spaceOnce('.home-entry-content, .home-entry-date');
};

applySpacing();
document.addEventListener('astro:page-load', applySpacing);

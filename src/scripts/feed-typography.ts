import Heti from 'heti/js/heti-addon.js';

/**
 * heti 的 autoSpacing() 会 setTimeout 之后才去查 DOM，没法用选择器控幂等；
 * 逐个根节点同步处理，跑过的打上标记。
 *
 * 必须防重复：`astro:page-load` 在首次加载时也会触发，跑第二遍会把已经生成的
 * <heti-adjacent> 再包一层（heti 的跳过表里漏了这个标签），句尾标点就被压两次。
 */
const heti = new Heti();

const spaceOnce = (selector: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach((root) => {
    if (root.dataset.hetiDone === 'true') return;
    root.dataset.hetiDone = 'true';
    heti.spacingElement(root);
  });
};

/** 首页/合集页的中西混排。ClientRouter 换页后 DOM 是新的，需要重新处理一遍。 */
const applySpacing = () => {
  spaceOnce('.home-entry-content, .home-entry-date');
};

applySpacing();
document.addEventListener('astro:page-load', applySpacing);

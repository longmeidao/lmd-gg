/**
 * `::: code-group` 容器的标签切换。
 *
 * useCodeGroups 名字像 React hook，实际只是往 window 上挂一个点击监听，
 * 所以不需要组件。原先那个空组件带 `client:only="react"`，一是让文章页
 * 白拉进整个 React 运行时，二是 dev 下 ClientRouter 遇到 client:only 会先
 * 用隐藏 iframe 把目标页整个再加载一遍（见 astro 的 transitions/router.js，
 * 仅 DEV），软跳转进文章页要多等一两秒。
 */
import { useCodeGroups } from 'remark-block-containers/useCodeGroups';

// 只注册一次：换页时这个模块不会重新求值，但直接调用会重复挂监听
const scope = window as typeof window & { __lmdCodeGroups?: boolean };
if (!scope.__lmdCodeGroups) {
  scope.__lmdCodeGroups = true;
  useCodeGroups();
}

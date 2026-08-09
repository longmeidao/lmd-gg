/** 直接注册代码组切换，避免为点击监听引入 React 运行时。 */
import { useCodeGroups } from 'remark-block-containers/useCodeGroups';

// 全局监听只注册一次。
const scope = window as typeof window & { __lmdCodeGroups?: boolean };
if (!scope.__lmdCodeGroups) {
  scope.__lmdCodeGroups = true;
  useCodeGroups();
}

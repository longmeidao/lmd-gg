/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module 'remark-block-containers/css';

declare module 'heti/js/heti-addon.js' {
  export default class Heti {
    constructor(rootSelector?: string);
    autoSpacing(): void;
    /** 同步处理单个根节点。autoSpacing 会 setTimeout 延后查询，逐个处理才好控幂等 */
    spacingElement(root: Element): void;
  }
}

interface ImportMetaEnv {
  readonly SHOW_PROTOTYPES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

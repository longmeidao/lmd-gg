/**
 * R2 上的图片地址。
 *
 * 桶里只存**原件**（`images/originals/`）。上传接口会实测候选派生文件，
 * 只有比原件更小时才把派生地址写进文章；原件始终保留。
 *
 * 好处是以后想换尺寸、加格式都不用重新上传，原件一直在。
 *
 * 转换必须从 media.lmd.gg 发起：走 lmd.gg 的话相对路径会解析到静态资源
 * 而不是 R2，直接 404。
 */
export const MEDIA_ORIGIN = 'https://media.lmd.gg';
export const ORIGINALS_PREFIX = 'images/originals';

/** 照片类正文图的最大展示宽度；PNG 截图由上传接口按原尺寸单独选择 */
export const BODY_WIDTH = 1200;
/** 归档方格 170px，2 倍余量 */
export const THUMB_WIDTH = 340;

/**
 * 这里仅用于归档封面等明确需要缩小的场景。正文 PNG 不走这条固定的有损
 * WebP 路线，否则截图文字会变糊。`fit=scale-down` 同时防止小图被放大。
 */
const QUALITY = 92;
const FORMAT = 'webp';

const transform = (width: number) =>
  `width=${width},fit=scale-down,quality=${QUALITY},format=${FORMAT},onerror=redirect`;

/** 由原件的 key 生成展示地址 */
export const mediaUrl = (key: string, width = BODY_WIDTH) =>
  `${MEDIA_ORIGIN}/cdn-cgi/image/${transform(width)}/${key.replace(/^\//, '')}`;

/**
 * 从任意一个本站图片地址里取出原件 key。
 * 既认转换地址，也认直接指向对象的地址。
 */
export const originalKey = (url: string): string => {
  const withoutOrigin = url.replace(/^https?:\/\/media\.lmd\.gg\//, '');
  return withoutOrigin.replace(/^cdn-cgi\/image\/[^/]+\//, '');
};

/** 换一个宽度重新生成（比如正文图 → 方格封面） */
export const resizeUrl = (url: string, width: number) => {
  const key = originalKey(url);
  return key.startsWith(ORIGINALS_PREFIX) ? mediaUrl(key, width) : url;
};

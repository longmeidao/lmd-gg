/**
 * R2 上的图片地址。
 *
 * 桶里只存**原件**（`images/originals/`），展示尺寸由 Cloudflare 的
 * Image Transformations 现场生成 —— 免费额度是每月 5000 次唯一转换，
 * 而「唯一」按 (图片 × 参数) 每月算一次，`format=auto` 不论发 AVIF 还是
 * WebP 都只算一次。这个站的量离额度差很远。
 *
 * 好处是以后想换尺寸、加格式都不用重新上传，原件一直在。
 *
 * 转换必须从 media.lmd.gg 发起：走 lmd.gg 的话相对路径会解析到静态资源
 * 而不是 R2，直接 404。
 */
export const MEDIA_ORIGIN = 'https://media.lmd.gg';
export const ORIGINALS_PREFIX = 'images/originals';

/** 正文列约 588px，2 倍余量 */
export const BODY_WIDTH = 1200;
/** 归档方格 170px，2 倍余量 */
export const THUMB_WIDTH = 340;

/**
 * `onerror=redirect`：万一某月超了免费额度，转换会返回 9422，
 * 这个参数让它回退到原件而不是裂图。源和转换同域时才可用，正好符合。
 */
const transform = (width: number) =>
  `width=${width},format=auto,onerror=redirect`;

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

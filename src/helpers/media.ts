/**
 * 从 media.lmd.gg 的 R2 原件生成图片转换地址。
 * lmd.gg 指向静态资源，不能作为转换来源。
 */
const MEDIA_ORIGIN = 'https://media.lmd.gg';
const ORIGINALS_PREFIX = 'images/originals';

/** 归档方格按 2 倍像素密度生成。 */
export const THUMB_WIDTH = 340;

/** 仅用于缩略图；scale-down 可避免放大小图。 */
const transform = (width: number) =>
  `width=${width},fit=scale-down,quality=92,format=webp,onerror=redirect`;

const mediaUrl = (key: string, width: number) =>
  `${MEDIA_ORIGIN}/cdn-cgi/image/${transform(width)}/${key.replace(/^\//, '')}`;

/** 从转换地址或原件地址中提取 R2 key。 */
const originalKey = (url: string): string => {
  const withoutOrigin = url.replace(/^https?:\/\/media\.lmd\.gg\//, '');
  return withoutOrigin.replace(/^cdn-cgi\/image\/[^/]+\//, '');
};

/** 使用新的宽度生成转换地址。 */
export const resizeUrl = (url: string, width: number) => {
  const key = originalKey(url);
  return key.startsWith(ORIGINALS_PREFIX) ? mediaUrl(key, width) : url;
};

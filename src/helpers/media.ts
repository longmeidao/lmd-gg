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
 * 质量 95 而不是默认的 85 —— 截图里的文字对压缩最敏感，85 的 AVIF 边缘会发糊。
 *
 * 1200px 下实测（迁移前 Astro 发的 webp 作对照）：
 *
 *   图片                     原件   迁移前 | q85   q90   q92   q95
 *   follow.png              1209K    257K | 123K  162K  185K  241K
 *   win-shift-s-capture.png  388K    184K | 209K  318K  383K  555K
 *   sharex-config.png        125K     62K |  44K   64K   76K  108K
 *
 * 代价集中在 win-shift-s-capture —— 那是张带照片背景的窗口截图，细节多，
 * AVIF 在高质量下反而比原 PNG 还大。要在体积和画质之间重新取舍，改这一个
 * 常量即可：q92 大致是平衡点，q85 是 Cloudflare 默认。
 *
 * 宽度不用调：正文列 588px CSS，2 倍屏需 1176 设备像素；手机列约 327px，
 * 3 倍屏需 981 —— 1200 两种都覆盖得住。q100 会跳到 730K，收益递减。
 *
 * `onerror=redirect`：万一某月超了免费额度，转换会返回 9422，
 * 这个参数让它回退到原件而不是裂图。源和转换同域时才可用，正好符合。
 */
const QUALITY = 95;

const transform = (width: number) =>
  `width=${width},quality=${QUALITY},format=auto,onerror=redirect`;

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

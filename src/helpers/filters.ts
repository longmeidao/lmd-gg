/**
 * 归档页和合集页共用的筛选定义。
 *
 * 两边都要这套图标、标签和媒介推断，之前只写在 archive.astro 里，
 * 合集页要用就得复制一份 —— 复制过的东西迟早会飘（block-default 已经飘过一次）。
 */

/** 媒介图标：对齐 jant 的 MEDIA_KIND_ICONS */
/** 媒介顺序固定，不跟着内容的出现顺序漂（同 jant 的 MediaCategory 排法） */
const MEDIA_ORDER = ['image', 'video', 'audio', 'file', 'attached', 'code'];

const MEDIA_ICONS: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'music',
  file: 'file',
  attached: 'fileText',
  code: 'code',
};

const MEDIA_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件',
  attached: '附文',
  code: '代码',
};

export const detectMedia = (
  body: string | undefined,
  kind: string,
  attached: boolean,
) => {
  const text = body ?? '';
  const media = new Set<string>();
  // 附文只认 frontmatter 的标记 —— 正文里的 `---` 常常只是作者手写的分隔线
  if (attached) media.add('attached');

  /**
   * 只统计「实际嵌入或上传」的媒介，不统计「提到了」。
   *
   * 一条 `[游戏预告片](https://www.youtube.com/watch?v=…)` 是正文里的链接，
   * 不是这条内容自带视频 —— 之前按域名匹配，这种就被误判成视频了。
   * 所以：要么是 <video>/<audio>/<img> 这类真实元素，要么是 iframe 嵌入，
   * 要么是 markdown 媒体语法里指向具体媒体文件的地址。
   */
  const VIDEO_EXT = 'mp4|webm|mov|m4v|mkv|avi';
  const AUDIO_EXT = 'mp3|m4a|wav|flac|aac|ogg|opus';
  const FILE_EXT =
    'pdf|epub|mobi|zip|rar|7z|tar|gz|docx?|xlsx?|pptx?|csv|txt|json|pages|numbers|key';
  /** markdown 的 ![](…) / []( …) 里的目标地址，或 HTML 的 src/href */
  const target = (ext: string) =>
    new RegExp(`(?:\\]\\(|src=["']|href=["'])[^)"'\\s]*\\.(?:${ext})\\b`, 'i');

  if (kind === 'photo' || /!\[[^\]]*\]\(|<img[\s>]/.test(text)) {
    media.add('image');
  }
  // <video> 本身、指向视频文件的地址、或视频站的 iframe 嵌入
  if (
    /<video[\s>]/.test(text) ||
    target(VIDEO_EXT).test(text) ||
    /<iframe[^>]+(?:youtube\.com|youtu\.be|bilibili\.com|vimeo\.com)/i.test(
      text,
    )
  ) {
    media.add('video');
  }
  if (/<audio[\s>]/.test(text) || target(AUDIO_EXT).test(text)) {
    media.add('audio');
  }
  // 文件：指向可下载附件的链接（图片、音视频已经单独归类了）
  if (target(FILE_EXT).test(text)) media.add('file');
  if (/^(?:```|~~~)/m.test(text)) media.add('code');
  return [...media];
};

interface FilterOption {
  value: string;
  label: string;
  icon?: string;
  /** 站里还没有这类内容，淡显 */
  empty?: boolean;
  /** 缩进一级，表示它是上一项的子筛选（同 jant 的 opt.indent） */
  indent?: boolean;
}

export interface FilterDef {
  name: string;
  label: string;
  icon: string;
  adminOnly: boolean;
  options: FilterOption[];
}

/** 参与筛选的条目需要提供的字段 */
interface FilterableEntry {
  kind: string;
  year: number;
  hasTitle: boolean;
  media: string[];
  collections: string[];
}

export const buildFilters = (
  entries: FilterableEntry[],
  /** 合集页本身就限定了一个合集，再给合集筛选没有意义 */
  options: { includeCollection?: boolean } = {},
): FilterDef[] => {
  const { includeCollection = true } = options;
  const years = [...new Set(entries.map((e) => e.year))]
    .filter(Boolean)
    .sort((a, b) => b - a);
  const collectionNames = [
    ...new Set(entries.flatMap((e) => e.collections)),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  // 媒介是固定词表（不像年份、合集那样由内容推出来），所以全部列出来；
  // 站里暂时还没有的那几种淡显，让人一眼看清有哪些维度，又不误以为有内容。
  const mediaKinds = MEDIA_ORDER.map((kind) => ({
    kind,
    empty: !entries.some((entry) => entry.media.includes(kind)),
  }));
  const isNote = (entry: FilterableEntry) =>
    entry.kind === 'note' || entry.kind === 'article';
  const hasNotes = entries.some(isNote);
  const hasTitledNotes = entries.some(
    (entry) => isNote(entry) && entry.hasTitle,
  );
  const hasUntitledNotes = entries.some(
    (entry) => isNote(entry) && !entry.hasTitle,
  );

  return [
    {
      name: 'year',
      label: '年份',
      icon: 'calendar',
      adminOnly: false,
      // 只有「全部 X」带图标：给一堆年份、合集重复挂同一个图标既没信息量又吵
      options: [
        { value: '', label: '全部年份', icon: 'calendar' },
        ...years.map((year) => ({ value: String(year), label: `${year} 年` })),
      ],
    },
    ...(includeCollection
      ? [
          {
            name: 'collection',
            label: '合集',
            icon: 'monitor',
            adminOnly: false,
            options: [
              { value: '', label: '全部合集', icon: 'monitor' },
              ...collectionNames.map((name) => ({ value: name, label: name })),
            ],
          },
        ]
      : []),
    {
      name: 'kind',
      label: '形式',
      icon: 'shapes',
      adminOnly: false,
      // 形式和媒介一样使用固定词表：全部列出，暂无内容的项淡显。
      // 层级照 jant：「随记」下面缩进出「有标题 / 无标题」两项。
      // 本站的 article 就是带标题的随记，归到「随记 › 有标题」下面。
      options: [
        { value: '', label: '全部形式', icon: 'shapes' },
        { value: 'note', label: '随记', icon: 'note', empty: !hasNotes },
        {
          value: 'note:titled',
          label: '有标题',
          icon: 'type',
          indent: true,
          empty: !hasTitledNotes,
        },
        {
          value: 'note:untitled',
          label: '无标题',
          icon: 'text',
          indent: true,
          empty: !hasUntitledNotes,
        },
        {
          value: 'link',
          label: '链接',
          icon: 'link',
          empty: !entries.some((entry) => entry.kind === 'link'),
        },
        {
          value: 'quote',
          label: '引文',
          icon: 'quote',
          empty: !entries.some((entry) => entry.kind === 'quote'),
        },
      ],
    },
    {
      name: 'thread',
      label: '串文',
      icon: 'branch',
      adminOnly: false,
      options: [
        { value: '', label: '全部内容', icon: 'branch' },
        { value: 'thread', label: '串文', icon: 'listTree' },
        { value: 'single', label: '单条', icon: 'gitCommit' },
      ],
    },
    {
      name: 'media',
      label: '媒介',
      icon: 'video',
      adminOnly: false,
      options: [
        { value: '', label: '全部媒介', icon: 'video' },
        ...mediaKinds.map(({ kind, empty }) => ({
          value: kind,
          label: MEDIA_LABELS[kind] ?? kind,
          icon: MEDIA_ICONS[kind],
          empty,
        })),
      ],
    },
    {
      name: 'visibility',
      label: '可见性',
      icon: 'scanEye',
      // 只有登录后才有意义，交给 HeaderActions 的 [data-admin-only] 逻辑放出来
      adminOnly: true,
      options: [
        { value: '', label: '全部可见性', icon: 'scanEye' },
        { value: 'public', label: '公开', icon: 'globe' },
        { value: 'featured', label: '精选', icon: 'sparkle' },
        { value: 'hidden', label: '不在最新', icon: 'eyeOff' },
        { value: 'private', label: '草稿', icon: 'lock' },
      ],
    },
  ].filter((filter) => filter.options.length > 1);
};

export const ICON_PATHS: Record<string, string> = {
  calendar:
    '<path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" />',
  monitor:
    '<rect width="20" height="14" x="2" y="3" rx="2" /> <line x1="8" x2="16" y1="21" y2="21" /> <line x1="12" x2="12" y1="17" y2="21" />',
  shapes:
    '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" /> <rect x="3" y="14" width="7" height="7" rx="1" /> <circle cx="17.5" cy="17.5" r="3.5" />',
  video:
    '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /> <rect x="2" y="6" width="14" height="12" rx="2" />',
  branch:
    '<path d="M15 6a9 9 0 0 0-9 9V3" /> <circle cx="18" cy="6" r="3" /> <circle cx="6" cy="18" r="3" />',
  scanEye:
    '<path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" /> <circle cx="12" cy="12" r="1" /> <path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0" />',
  note: '<path d="M8 2v4" /> <path d="M12 2v4" /> <path d="M16 2v4" /> <rect width="16" height="18" x="4" y="4" rx="2" /> <path d="M8 10h6" /> <path d="M8 14h8" /> <path d="M8 18h5" />',
  link: '<path d="M15 3h6v6" /> <path d="M10 14 21 3" /> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
  quote:
    '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" /> <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />',
  type: '<path d="M12 4v16" /> <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /> <path d="M9 20h6" />',
  text: '<path d="M21 5H3" /> <path d="M15 12H3" /> <path d="M17 19H3" />',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" />',
  paperclip:
    '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />',
  code: '<path d="m16 18 6-6-6-6" /> <path d="m8 6-6 6 6 6" />',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  music:
    '<path d="M9 18V5l12-2v13" /> <circle cx="6" cy="18" r="3" /> <circle cx="18" cy="16" r="3" />',
  fileText:
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
  listTree:
    '<path d="M8 5h13" /> <path d="M13 12h8" /> <path d="M13 19h8" /> <path d="M3 10a2 2 0 0 0 2 2h3" /> <path d="M3 5v12a2 2 0 0 0 2 2h3" />',
  gitCommit:
    '<circle cx="12" cy="12" r="3" /> <line x1="3" x2="9" y1="12" y2="12" /> <line x1="15" x2="21" y1="12" y2="12" />',
  globe:
    '<circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /> <path d="M2 12h20" />',
  eyeOff:
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /> <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /> <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /> <path d="m2 2 20 20" />',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" />',
  // 精选沿用 jant 自绘的星芒（不是 lucide 的 star）
  sparkle:
    '<path d="M12 3 10.1 10.1 3 12l7.1 1.9L12 21l1.9-7.1L21 12l-7.1-1.9Z" />',
};

/* ============ 常量 · 默认设置 · 通用工具 ============ */

const PLUGIN_ID = "grid-diary";
const VIEW_GRID = "gd-grid-view";
const VIEW_SIDEBAR = "gd-sidebar-view";
const VIEW_TIMELINE = "gd-timeline-view";
const VIEW_CALENDAR = "gd-calendar-view";
const VIEW_TABLE = "gd-table-view";
const ICON_GRID = "layout-grid";
const ICON_SIDEBAR = "list-tree";
const ICON_TIMELINE = "history";
const ICON_CALENDAR = "calendar-days";
const ICON_TABLE = "table";

/* v1.x 注册过的视图 id。Obsidian 会把标签页类型写进 workspace.json，
 * 升级后若不认这些老名字，那些标签就会显示「插件不再活动」。
 * 从旧源码确认的四个：主格子 / 日历 / 左侧目录 / 时间线。
 * v3 把日历重新做回来了，所以老日历标签直接映射到新的日历视图。 */
const LEGACY_VIEWS = {
  "grid-diary-view": VIEW_GRID,
  "grid-diary-calendar": VIEW_CALENDAR,
  "grid-diary-explorer": VIEW_SIDEBAR,
  "grid-diary-timeline": VIEW_TIMELINE,
};

/* 五种页面风格。card/paper 是 v2 就有的，后三种是 v3 新增。 */
const THEMES = [
  ["card", "现代卡片"],
  ["paper", "手账纸感"],
  ["magazine", "杂志留白"],
  ["bento", "便当格"],
  ["mono", "极简黑白"],
];

/* ---- 日历骨架：日期怎么排（5 种）---- */
/* 模板种类：主页 / 目录 / 日历 / 悬浮窗 / 格子 / 表格（用户要求的排序即此顺序） */
const TEMPLATE_KINDS = [
  ["home", "主页"],
  ["dir", "目录"],
  ["cal", "日历"],
  ["float", "悬浮窗"],
  ["grid", "格子"],
  ["table", "表格"],
];
const TEMPLATE_KIND_ORDER = TEMPLATE_KINDS.map((k) => k[0]);
function templateKind(tpl) {
  const k = tpl && tpl.kind;
  return TEMPLATE_KIND_ORDER.includes(k) ? k : "grid";
}
function sortTemplates(list) {
  return (list || [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ka = TEMPLATE_KIND_ORDER.indexOf(templateKind(a.t));
      const kb = TEMPLATE_KIND_ORDER.indexOf(templateKind(b.t));
      return ka !== kb ? ka - kb : a.i - b.i;
    })
    .map((x) => x.t);
}

const CAL_SKELETONS = [
  ["grid", "月网格"],
  ["strip", "周条"],
  ["annual", "纵向年历"],
  ["hero", "大日期"],
  ["split", "双栏月历"],
  ["dual", "双月并排"],
];
/* ---- 日历纹理：底子怎么画（6 种，可独立开关）---- */
const CAL_TEXTURES = [
  ["none", "无"],
  ["graph", "方格纸"],
  ["dots", "点点阵"],
  ["lines", "细横线"],
  ["paper", "纸纹"],
  ["gradient", "渐变"],
  ["diag", "斜纹"],
  ["cross", "十字纹"],
  ["noise", "噪点"],
  ["wood", "木纹"],
  ["marble", "大理石"],
  ["checker", "棋格"],
];
/* ---- 日历底图摆放（v3.24 收成两种）----
 * 用户：「日历整张铺满并不是我想要的……日历会随着摆放的位置变动，日历与图片不会重叠」
 * 所以只留：横幅（图片独占一条，日历排在下面，永不重叠）/ 整块铺满（图片当整页背景）。
 * 原来的左上角、右下角、双角三种是「图片压在日历上」，正是重叠的来源，删掉。 */
const CAL_WALL_POS = [
  ["banner", "顶部横幅（日历在下方，不重叠）"],
  ["full", "整块铺满（图片当整页背景）"],
];

/* ══════════ 目录颜色编号（v4 T-03）══════════
 * 用户要求：目录/文件夹竖排的每一行按出现顺序换色，不是固定一种；
 * 可自定义添加；先给两套随机色。
 * 生成方式：HSL 均匀取色，保证相邻两项色差足够大。
 * ═══════════════════════════════════════════════════════ */
function treeRing(hueStart, sat, light, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (hueStart + (360 / n) * i) % 360;
    out.push(`hsl(${h.toFixed(0)} ${sat}% ${light}%)`);
  }
  return out;
}

/* 两套随机配色方案（用户原话：先两套随机颜色） */
/* ══════════ 动图 / 视频壁纸（v4 T-06）══════════ */
const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|m4v|mkv)$/i;
const ANIM_EXT_RE = /\.(gif|webp|apng)$/i;

function isVideoSrc(src) { return VIDEO_EXT_RE.test(String(src || "").split("?")[0]); }
function isAnimSrc(src) { return ANIM_EXT_RE.test(String(src || "").split("?")[0]); }

const TREE_COLOR_SETS = [
  { id: "random-a", name: "随机 A（暖彩）", ring: treeRing(12, 62, 42, 12) },
  { id: "random-b", name: "随机 B（冷彩）", ring: treeRing(196, 55, 44, 12) },
];

/* ══════════ v3.23：按色结构已删除 ══════════
 * 用户：「删掉除目录以外的按色结构」。
 * 这里原本是一整套「按日 / 按周 / 按月换底色」的槽位系统：
 *   MONTH_SLOT_N / MONTH_PALETTE / WEEK_PALETTE / DAY_PALETTE /
 *   parseSlot / slotRaw / bgRawSlot / bgRawSlotOf / bgSlotOf / bgSlotForDate / bgColorForDate
 * 它跟 projectBg 的「五处背景」写同一批 CSS 变量（--gd-bg-color / --gd-bg-image），
 * 是背景串台的主要来源之一，整体移除。
 * 目录的按序配色（TREE_COLOR_SETS / treeColorOf / treeRingRandom）保留，不动。 */

/* 按序号取色（同组内 0,1,2… 依次换色，循环） */
function treeColorOf(setId, index) {
  const set = TREE_COLOR_SETS.find((s) => s.id === setId) || TREE_COLOR_SETS[0];
  const n = set.ring.length || 1;
  return set.ring[((index % n) + n) % n];
}

/* 重新随机一套（种子变化 → 色环整体旋转） */
function treeRingRandom(setId, seed) {
  const set = TREE_COLOR_SETS.find((s) => s.id === setId) || TREE_COLOR_SETS[0];
  const n = set.ring.length || 12;
  const base = ((Number(seed) || 0) * 37) % 360;
  return treeRing(base, 58, 44, n);
}

/* ══════════ 各处各自的背景（v3.14，v3.23 拆细）══════════
 * 用户要求：底图从「主题」里拿出来，分散装到各处；每处都能纯色/图片/渐变/纹理/玻璃；
 * 格子背景也跟背景放在一起，不许再散。
 * v3.23：用户「目录上层区和下层区」「主页中间背景 / 主页中间的格子」
 *       要分开管，所以目录拆成 dirTop / dirBot 两条，各自画在自己那块面板上。 */
const BG_PROJECTS = [
  ["home", "主页中间", ".gd-grid-root"],
  ["dirTop", "目录上层区", ".gd-split-top"],
  ["dirBot", "目录下层区", ".gd-split-bot"],
  ["cal", "日历", ".gd-cal-panel"],
  ["float", "灵感", ".gd-float"],
  ["tl", "流线图", ".gd-timeline-root"],
];

/* 一处背景的默认值 */
function defaultBgCfg() {
  return {
    mode: "color",       // color / image / gradient / texture / glass / video / transparent
    color: "",
    image: "",
    crop: null,          // 背景图 / 缩略图的裁剪框（只存百分比坐标，不剪原图）
    gradient: "",
    texture: "none",
    glass: 12,           // 玻璃的模糊强度
    glassTint: "",       // 玻璃的底色
    video: "",           // 视频背景（库内路径），mode=video 时用
    videoLoop: true,
    wall: null,          // 照片墙（只主页有）：{on, items:[{src,x,y,w,h}], limit, unlimited}
    /* 格子背景：跟背景放在一起 */
    cellMode: "follow",  // follow / color / image / glass
    cellColor: "",
    cellImage: "",
    cellGlass: 8,
  };
}

/* 取某一处的背景配置（补齐默认值，不改原对象）。
   v3.23：目录拆成 dirTop / dirBot 两条之后，老数据里只有一份 projectBg.dir，
   所以这两条都回落到那份老配置 —— 用户升级后不会突然变空。 */
function bgCfgOf(settings, key) {
  const s = settings || {};
  const pb = s.projectBg || {};
  let raw = pb[key];
  if (!raw && (key === "dirTop" || key === "dirBot")) raw = pb.dir;
  raw = raw || {};
  const out = defaultBgCfg();
  for (const k of Object.keys(out)) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  /* 主页兼容老字段：老数据里背景存在全局 bgMode/bgColor… 上 */
  if (key === "home") {
    if (raw.mode === undefined && s.bgMode) out.mode = s.bgMode;
    if (raw.color === undefined && s.bgColor) out.color = s.bgColor;
    if (raw.image === undefined && s.bgImage) out.image = s.bgImage;
    if (raw.gradient === undefined && s.bgGradient) out.gradient = s.bgGradient;
    if (raw.texture === undefined && s.bgTexture) out.texture = s.bgTexture;
  }
  return out;
}

/* 照片墙：只属于主页（用户：「照片墙只独属于主页」）。
   其余项目第二层就叫「图片」，一张，不是照片墙。 */
function defaultWall() {
  return { on: false, items: [], limit: 12, unlimited: false };
}

/* 目录图标来源：内置线体 / 表情 / 图片（库里选或直接粘网址） */
const TREE_ICON_SOURCES = [
  ["builtin", "内置图标"],
  ["emoji", "表情"],
  ["image", "图片（库里选或粘网址）"],
];

/* 目录行首标记：小三角与圆点二选一（用户：「点点与下标箭头是二选一」） */
const TREE_MARK_MODES = [
  ["caret", "小三角 ▾（点它折叠）"],
  ["dot", "圆点 ●（点它折叠）"],
];

/* 快捷裁剪方式：所有选图入口在图片下面出这一排，选完点保存 */
const CROP_PRESETS = [
  ["center", "居中裁剪"],
  ["fill", "填充"],
  ["fit", "适应"],
  ["stretch", "拉伸"],
  ["tile", "平铺"],
  ["raw", "原图"],
];

/* 背景形态清单 */
const BG_MODES = [
  ["color", "纯色"],
  ["image", "图片"],
  ["gradient", "渐变"],
  ["texture", "纹理"],
  ["glass", "玻璃磨砂"],
  ["video", "视频"],
  ["transparent", "透明（露出主题）"],
];

/* 格子背景形态清单 */
const CELL_BG_MODES = [
  ["follow", "跟着上面的背景"],
  ["color", "纯色"],
  ["image", "图片"],
  ["glass", "玻璃磨砂"],
];

/* 四个可以单独设视觉的项目：目录 / 日历 / 悬浮窗 / 流线图 */
const PROJECT_KEYS = [
  ["dir", "目录", ".gd-sidebar-root"],
  ["cal", "日历", ".gd-cal-panel"],
  ["float", "悬浮窗", ".gd-float"],
  ["tl", "流线图", ".gd-timeline-root"],
];

/* 每个项目能单独覆盖的项：CSS 变量名 → 说明。
   v3.23：从 12 项收到 3 项。底色/底图归 projectBg（背景那一套），
   字族/字号/线宽/圆角/间距/内边距/不透明度统一由全局主题管，
   每处只留字色 / 线色 / 强调色，避免同一变量被两套写来写去。 */
const PROJECT_VAR_KEYS = [
  ["fontColor", "--gd-ink", "字色"],
  ["lineColor", "--gd-line", "线色"],
  ["accent", "--gd-accent", "强调色"],
];

/* 头像轮廓（用户：「就是一个轮廓，只要不是圆的就行。多设计几种轮廓。」） */
const AVATAR_SHAPES = [
  ["circle", "圆形"],
  ["square", "正方形"],
  ["rounded", "圆角方"],
  ["rect", "长方形"],
  ["capsule", "胶囊"],
  ["diamond", "菱形"],
  ["hex", "六边形"],
  ["triangle", "三角形"],
];

/* 四种格子边框（纸胶带已按用户要求删除） */
const BORDERS = [
  ["none", "无边框"],
  ["hair", "细线"],
  ["double", "双线"],
  ["dashed", "虚线"],
];
/* 贴纸三组：天气 / 心情 / 标签。纯 emoji，不引外部资源。 */
const STICKER_GROUPS = [
  ["weather", "天气", ["☀️", "⛅", "🌧️", "⛈️", "❄️", "🌈", "🌙", "🌫️"]],
  ["mood", "心情", ["😌", "🙂", "😐", "😮‍💨", "🥲", "😤", "🥳", "😴"]],
  ["tag", "标签", ["📚", "🏃", "🍜", "💡", "🎬", "✈️", "🎵", "🌱", "❤️", "⭐"]],
];
const ALL_STICKERS = STICKER_GROUPS.reduce((a, g) => a.concat(g[2]), []);
/* 五款表格皮肤（v3 用在格子内嵌 md 表格 / 设置列表 / 快照列表，不动正文普通表格） */
const TABLE_SKINS = [
  ["zebra", "斑马表"],
  ["rule", "三线表"],
  ["bento", "便当格"],
  ["magazine", "细线杂志"],
  ["glass", "毛玻璃（按需）"],
];
/* 网格流方向：竖向（现状）| 横向（新增，解决"只能上下拉"） */
const GRID_FLOWS = [
  ["vertical", "上下滚（默认）"],
  ["horizontal", "左右滚"],
  ["paged", "左右翻页"],
];
/* 引导问题库：九宫格日记的精髓是"每格一句问句"，这里给三组轮换 */
const PROMPT_SETS = {
  晨间: ["今天的天气", "昨天晚上梦到什么", "今天最重要的一件事", "想感谢的人", "此刻的身体状态", "今天的情绪", "最期待的事", "今日反思", "明日计划"],
  日间: ["今天发生了什么", "今日书账/花了什么", "今天学到的新知", "今天的碎碎念", "今天吃了什么", "今天的反思"],
  夜间: ["今天最开心的一刻", "今天最难的时刻", "今天做成了什么", "哪里卡住了", "想对明天说的话", "今天值得记住的人"],
};
/* ============ 四层自由布局 ============
 * 用户要求：「图片的拉扯只限于图片，文本框只限于文本框，背景只限于背景，彼此独立。」
 * 做法：封面区变成一块舞台（.gd-cover-stage），上面叠四个可独立移动/缩放的层，
 * 每层用百分比坐标存，换窗口大小也不会散架。
 *   bg   —— 背景（封面图 / 渐变）
 *   img  —— 照片（第二张图，可独立于背景摆放）
 *   text —— 座右铭
 *   mark —— 头像标志
 * 老格式（cover + coverHeight + coverPos）读进来时自动折算成默认四层，不写回原文件。 */
const LAYER_KEYS = ["bg", "img", "text", "mark"];
const LAYER_NAMES = { bg: "背景", img: "照片墙", text: "座右铭", mark: "标志" };
const DEFAULT_LAYERS = {
  bg:   { x: 0,  y: 0,  w: 100, h: 100, on: true },
  img:  { x: 62, y: 8,  w: 30,  h: 66,  on: false },
  text: { x: 4,  y: 8,  w: 56,  h: 26,  on: false },
  mark: { x: 4,  y: 82, w: 12,  h: 16,  on: false },
};
/* 推板步长：鼠标点一下挪多少（百分比） */
const LAYER_STEPS = [1, 5, 10];

/* 目录配色：一套引擎 + 五套预设 */
const TREE_PALETTES = [
  ["warm", "暖木"],
  ["ink", "墨青"],
  ["rainbow", "彩虹"],
  ["mono", "单色"],
  ["depth", "按层级"],
];

const STICKER_DIR = "gd-stickers";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(.*)\.md$/;
const LAYOUT_RE = /<!--\s*gd-layout\s*([\s\S]*?)\s*-->/;
const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

/* 中国大陆法定节假日（2025–2027，够用；表外的按周末/工作日推断） */
const HOLIDAYS = {
  "2025-01-01": "元旦", "2025-01-28": "除夕", "2025-01-29": "春节", "2025-01-30": "春节", "2025-01-31": "春节",
  "2025-02-01": "春节", "2025-02-02": "春节", "2025-02-03": "春节", "2025-02-04": "春节",
  "2025-04-04": "清明", "2025-04-05": "清明", "2025-04-06": "清明",
  "2025-05-01": "劳动节", "2025-05-02": "劳动节", "2025-05-03": "劳动节", "2025-05-04": "劳动节", "2025-05-05": "劳动节",
  "2025-05-31": "端午", "2025-06-01": "端午", "2025-06-02": "端午",
  "2025-10-01": "国庆", "2025-10-02": "国庆", "2025-10-03": "国庆", "2025-10-04": "国庆",
  "2025-10-05": "国庆", "2025-10-06": "国庆", "2025-10-07": "国庆", "2025-10-08": "国庆",
  "2026-01-01": "元旦", "2026-01-02": "元旦", "2026-01-03": "元旦",
  "2026-02-16": "除夕", "2026-02-17": "春节", "2026-02-18": "春节", "2026-02-19": "春节",
  "2026-02-20": "春节", "2026-02-21": "春节", "2026-02-22": "春节", "2026-02-23": "春节",
  "2026-04-04": "清明", "2026-04-05": "清明", "2026-04-06": "清明",
  "2026-05-01": "劳动节", "2026-05-02": "劳动节", "2026-05-03": "劳动节", "2026-05-04": "劳动节", "2026-05-05": "劳动节",
  "2026-06-19": "端午", "2026-06-20": "端午", "2026-06-21": "端午",
  "2026-09-25": "中秋", "2026-09-26": "中秋", "2026-09-27": "中秋",
  "2026-10-01": "国庆", "2026-10-02": "国庆", "2026-10-03": "国庆", "2026-10-04": "国庆",
  "2026-10-05": "国庆", "2026-10-06": "国庆", "2026-10-07": "国庆", "2026-10-08": "国庆",
  "2027-01-01": "元旦", "2027-01-02": "元旦", "2027-01-03": "元旦",
  "2027-02-05": "除夕", "2027-02-06": "春节", "2027-02-07": "春节", "2027-02-08": "春节",
  "2027-02-09": "春节", "2027-02-10": "春节", "2027-02-11": "春节",
  "2027-04-05": "清明", "2027-05-01": "劳动节", "2027-06-09": "端午",
  "2027-09-15": "中秋", "2027-10-01": "国庆", "2027-10-02": "国庆", "2027-10-03": "国庆",
  "2027-10-04": "国庆", "2027-10-05": "国庆", "2027-10-06": "国庆", "2027-10-07": "国庆",
};
const MAKEUP_WORKDAYS = {
  "2025-01-26": 1, "2025-02-08": 1, "2025-04-27": 1, "2025-09-28": 1, "2025-10-11": 1,
  "2026-02-14": 1, "2026-02-15": 1, "2026-04-26": 1, "2026-09-20": 1, "2026-10-10": 1,
  "2027-02-04": 1, "2027-04-25": 1, "2027-09-26": 1, "2027-10-09": 1,
};
/* 返回 { kind: "holiday" | "workday" | "weekend", name } */
function dayKind(dateStr) {
  const s = String(dateStr || "").slice(0, 10);
  if (!s) return { kind: "workday", name: "" };
  if (HOLIDAYS[s]) return { kind: "holiday", name: HOLIDAYS[s] };
  if (MAKEUP_WORKDAYS[s]) return { kind: "workday", name: "调休上班" };
  const d = parseDate(s);
  const w = d && !isNaN(d.getTime()) ? d.getDay() : -1;
  if (w === 0 || w === 6) return { kind: "weekend", name: "" };
  return { kind: "workday", name: "" };
}
const IS_MOBILE = !!(Platform.isMobile || Platform.isMobileApp);
const PASTE_MODES = [
  ["auto", "自动识别（推荐）"],
  ["headings", "按标题行拆分"],
  ["blank", "按空行分段"],
  ["table", "按 Markdown 表格"],
  ["raw", "整段放一格"],
];
const PASTE_TARGETS = [
  ["replace", "替换整篇（新建格子）"],
  ["append", "追加到末尾"],
  ["merge", "同名合并 / 新标题追加"],
];

function tc(list, n, kind) {
  return { name: list, kind: kind || "grid", cells: n.map((t) => ({ title: t, cs: 1, rs: 1, h: 0, accent: "" })) };
}

const DEFAULT_SETTINGS = {
  version: 3,
  rootFolder: "日记",
  theme: "card",                 // card | paper | magazine | bento | mono
  skin: "zebra",                 // 内嵌表格皮肤
  columns: 2,
  rowHeight: 150,
  gap: 14,
  pad: 20,
  radius: 14,
  accent: "#c2704f",
  cardOpacity: 1,
  fontFamily: "",
  fontSize: 15,
  /* ── 主题系统（v4）── */
  themeDir: "主题",              // 主题文件放在 库/主题/
  activeTheme: "",               // 当前套用的主题名（空 = 用散项）
  autoApplyTheme: true,          // 启动时自动套用 activeTheme
  projectName: "日记",
  projectCarryLayout: true,   /* 切项目时连视觉（主题/皮肤/边框/底色）一起换 */
  projectLayouts: {},         /* 每个项目记住自己的一套视觉 */           // 当前项目名（多项目由 themeDir 下的项目文件管理）
  /* 底色（主题组 bg）
     注意：v3.23 起主页背景的唯一出口是 applyProjectBg()（projectBg.home）。
     这几项只是给「老 data.json」留的兜底字段，bgCfgOf() 在 projectBg.home 没写时才读它们；
     界面里已经不再提供入口，也不再参与按日/按周/按月的换色。 */
  bgMode: "color",               // color | gradient | image | texture
  bgColor: "",
  bgGradient: "",
  bgImage: "",
  bgTexture: "none",
  bgVideo: "",                   // 背景视频（库内路径）
  bgVideoLoop: true,
  bgFollowObsidian: false,       // 底色跟随 Obsidian 主题
  bgFollowBlur: 0,               // 跟随主题时的磨砂
  /* 字体颜色与字距 */
  fontColor: "",
  letterSpacing: 0,
  /* 线体 */
  lineColor: "",
  lineWidth: 1,
  lineStyle: "solid",
  /* 目录颜色编号（T-03） */
  treeColorMode: "numbered",     // numbered | single | palette
  treeColorSet: "random-a",      // random-a | random-b
  treeColorOverrides: {},
  treeColorRing: [],          // 当前生效的色环（空 = 用方案默认）
  treeRandomSeed: 0,
  /* v3.23：底图月/周/日节奏（T-04）已整体删除，见文件上方说明 */
  /* 视频/动图壁纸（T-06） */
  videoEnabled: false,
  videoMaxMB: 20,
  videoMaxSec: 60,
  /* 轮播壁纸（T-07） */
  carouselList: [],
  carouselEvery: "open",         // 30s | 5m | open | day
  carouselIndex: 0,
  /* ── 正文排版（Reeden 式纸书感）── */
  paraIndent: 2,          // 首行缩进，单位 em
  paraGap: 0.8,           // 段落间距，单位 em
  paraFontGap: 0.5,       // 字体下方间距，单位 em
  lineHeight: 1.7,
  customCss: "",
  autoCreateToday: true,
  dailyTemplatePath: "",     // 新建日记时套用自己的 md 文件（旧版功能）
  headingLevel: 2,           // 旧版「一格 = 一个二级标题」
  showEmptyHint: true,
  renderMarkdown: false,
  mobileOneColumn: true,
  showSidebar: true,
  sidebarWidth: 250,
  timelinePlacement: "right",    // right | left | tab
  timelineWidth: 260,            // 流线图（右侧栏）宽度
  timelineSquare: true,          // 流线图条目接近方形，而不是扁长条
  timelinePreviewAbove: true,    // 点一条 → 预览铺在原文正上方（视觉在上、文字在下）
  autoSnapshot: true,
  snapshotsPerDay: 30,
  snapshotThrottle: 45,          // 秒：同一文件两次自动快照最小间隔
  pasteMode: "auto",
  pasteTarget: "replace",
  pasteFirstLineAsTitle: true,
  pasteSeparator: "",
  pasteKeepKeywords: [],         // 只保留含这些词的段落（空 = 不过滤）
  pasteDropKeywords: [],         // 丢掉含这些词的段落
  pasteKeepFrom: "",             // 从这个标题之后的内容全保留（例如「今日事件」）
  pasteFormatFilter: "all",      // all | text | noimage | notable
  pasteKeepHeadingOnly: false,   // 只保留标题行，正文丢弃
  templates: [
    tc("格间六格", ["今日事件", "今日书账", "今日新知", "今日碎记", "今日美食", "今日反思"]),
    tc("九宫格晨间", ["今天的天气", "昨天最难忘的事", "今天最重要的一件事", "想感谢的人", "今天的情绪", "身体状态", "今天的期待", "今日反思", "明日计划"]),
    tc("复盘", ["做成了什么", "哪里卡住", "学到了什么", "下次怎么做"]),
  ],
  activeTemplate: "格间六格",

  /* ---- v3 新增：九宫格本体 ---- */
  flow: "vertical",              // vertical | horizontal | paged
  cellWidth: 260,                // 横向模式下的格子宽度（190–560）
  flowRows: 3,                   // 横向模式一屏几行（九宫格默认 3 行）
  pageCols: 3,                   // 翻页模式一屏几列
  pagedSnap: true,               // 翻页时吸附
  defaultBorder: "hair",         // 新格子的默认边框
  coverHeight: 160,              // 封面高度（0 = 不显示）
  showCover: true,
  coverFallback: "gradient",     // gradient | firstImage | none
  centerCell: false,             // 中央格（曼陀罗式）强调
  showPromptHint: true,          // 空格显示引导问句
  hoverLift: true,               // 输入时格子轻微抬起
  showWordTicker: false,         // 格子底部字数进度纹
  animPlayMode: "always",        // always | hover（动图播放策略）
  animMaxMB: 8,                  // 大于此值的动图给提示
  promptSet: "日间",
  /* ---- v3 新增：悬浮窗 ---- */
  floatEnabled: true,
  floatAutoOpen: false,      /* 启动时自动弹出灵感笔记：默认关 */
  calFloatAutoOpen: false,
  calFloatWallOnTop: true,   /* 日历浮窗：壁纸只占顶部一条，内容往下排 */
  tlFloatRect: null,         /* 时间线浮窗上次的位置与大小 */   /* 启动时自动弹出日历浮窗：默认关 */
  floatRect: null,               // {left, top, width, height}
  floatSize: "m",                // s | m | l
  floatEdgeDock: false,          // 贴边半收
  floatTitle: "灵感笔记",        // 悬浮窗标题（原「格间日记」，改名以区分日历浮窗）
  floatMode: "grid",             /* v3.23：grid=跟当天九宫格日记联动 | note=普通笔记 */
  floatNoteFolder: "灵感",       /* 普通笔记模式新建文件放这儿 */
  /* 灵感自己的背景（用户：只留图片 + 透明度两项） */
  floatBg: "",
  floatBgOpacity: 1,
  floatFollowTheme: true,        /* 灵感浮窗跟随主题配色；关掉才用「悬浮窗」自己那套 */
  /* 日历浮窗外观：用户要「纯色底 + 可调透明度 + 磨砂」 */
  calFloatBg: "",
  calFloatFollowTheme: true,
  tlFollowTheme: true,     /* 日历浮窗跟随主题配色；关掉才用「日历」自己那套 */                // 空 = 跟随主题底色；否则 #rrggbb
  calFloatOpacity: 0.96,         // 0.4–1
  calFloatBlur: 0,               // 0–24，磨砂强度
  calFloatShadow: true,          // 投影（关掉更轻）
  /* ---- 四层自由布局 ---- */
  favoriteFiles: [],             // 收藏的日记（相对路径）
  /* 图标风格（10 种）：none / dot / line / dash / bar / ring / square / number / emoji / icon */
  /* 图标样式 10 种：dot 圆点 / ring 空心圈 / square 方块 / diamond 菱形 / arrow 箭头 /
   * check 对勾 / dash 短横 / star 星 / emoji 表情 / icon 图标字体 */
  treeIconStyle: "dot",
  treeMarkMode: "caret",         // caret 小三角 / dot 圆点（二选一）
  treeMoveMode: false,           // 移动模式（拖动文件夹换顺序）
  treeSlimTop: true,
  treeFuncBar: true,
  treeSepStyle: "none",          // 分区分隔符：none / line / dash / dot / wave / star / heart / leaf / sun / arrow
  treeSepChar: "",               // 自定义分隔符（填了就优先用它）
  treeSortMode: "date-desc",     // date-desc | date-asc | name | hits | mtime
  treeFilterMode: "all",         // all | fav | filled | empty
  treeGroupMode: "smart",        // smart(今天/昨天/前七天/更早) | month | none
  treeDragMove: true,            // 允许拖拽移动文件 / 文件夹
  treeDimOnOpen: false,          // 打开过的日记文字变灰
  treeDimKeys: [],               // 被手动标灰的 key
  treeCompact: false,            // 紧凑模式：一行一个，不显示摘要
  treeThumb: true,               // 文件行显示封面缩略图
  treeGlassTop: false,           // 目录上半（文件夹区）磨砂，默认不开＝没开销
  treeGlassBot: false,           // 目录下半（文件区）磨砂
  treeShowFolderPane: true,      // 目录上半「文件夹区域」显不显示
  treeShowStats: true,           // 显示篇数 / 字数
  treeHiddenFolders: [],         // 隐藏的文件夹（相对 root 的路径）
  treeFolderOrder: [],           // 文件夹手动顺序
  treeFolderStyles: {},          // 每个文件夹独立外观 { 路径: {color, emoji, icon, img} }
  timelineCompactTop: true,      // 流线图顶部收成一个图标
  /* v3.23：流线图的「改动上色」整块删除（连卡片左边那三条色条） */
  treeShowHidden: false,         // 临时显示被隐藏的文件夹
  treeFolderColor: "",           // 文件夹主色（空 = 跟随调色板）
  treeShowOtherFiles: true,
    treeMonthFold: true,      // 目录里显示非日记文件
  treeCollapsedByDefault: false, // 月份分组默认折叠
  treeShowHitCount: true,        // 显示「最近点开次数」
  treeShowFoot: false,           // 底部时间线/日历/设置（默认去掉）
  treeHits: {},                  // 目录点击次数（热度）
  attachFolder: "attachments",   // 图片等附件的独立目录
  autoFollowCells: true,
  cellResizeMode: "linked",      /* 拖角：linked=整表一起缩放 | single=只改这一格 */         // 改一格其他格跟随（默认开）
  rawFormat: "markdown",         // 原文模式默认视图
  layers: null,                  // null = 用 DEFAULT_LAYERS
  layerStep: 5,                  // 推板步长 1 | 5 | 10
  stageHeight: 220,
  splitMode: "whole",            // whole 整块铺满 | top 上下分屏 | left 左右分屏
  splitAt: 58,                   // 分割线位置（百分比）              // 舞台高度
  showStage: false,
  avatarCrop: null,        /* 头像的裁剪框（全局，跟头像一起走） */
  calWallCrop: null,       /* 日历底图的裁剪框 */
  bgCrop: null,            /* 主题壁纸的裁剪框 */              // 新版封面舞台（关 = 用旧版封面，兼容老视觉）
  mottoColor: "",                // 空 = 跟随主题
  mottoOpacity: 1,
  mottoWeight: 600,
  mottoShadow: true,             // 描边光晕（浅底深字 / 深底浅字都能读）
  markRing: "none",              // none | thin | double | glow | dash（五款相框）
  markName: "",                  // 圆框下方名字
  markSize: 56,
  photoFit: "cover",             // cover 居中裁剪 | contain 完整显示 | fill 拉伸 | nine 九宫格
  nineSlice: 24,                 // 九宫格切片像素
  mergeBgImg: false,             // 背景层与照片层合并成一层
  reuseCoverFrom: "",            // 「用某天的封面」暂存
  /* ---- v3 新增：日历 ---- */
  calendarMode: "month",         // day | week | month | year
  calendarPlacement: "tab",      // tab | right
  showCalendarAxis: true,        // 轴视图
  /* ---- v3 新增：皮肤按需 ---- */
  /* ---- v3.2 新增：日历骨架 × 纹理 ---- */
  calSkeleton: "grid",           // grid | strip | annual | hero | split | dual（默认单月 = grid）
  calTexture: "paper",           // none | graph | dots | lines | paper | gradient
  calLunarMode: "major",         // none | major（初一/十五/节日）| full（全部农历日）
  calShowTerm: true,             // 显示节气
  calShowFestival: true,
  calShowHoliday: true,         // 显示节日
  calWallpaper: "",              // 日历底图（库内图片路径）
  /* v3.24：日历底图只留两种摆法
     banner = 顶部横幅，图片独占一条，日历排在它下面，两者永不重叠
     full   = 整块铺满，图片当整张背景，日历浮在上面 */
  calWallpaperPos: "banner",     // banner | full
  calBannerH: 120,               // banner 模式下横幅高度（px），可调
  calWallpaperOpacity: 0.85,
  calWallpaperBlur: 0,           // 0-12，模糊度（铺满时常用）
  calWallFit: "cover",           // cover | contain —— 图片在框里的总体缩放方式
  calWallWallMigrated: false,    // v3.24 一次性迁移标记：老的四摆位统一转成 banner
  calPanel: "tab",               // tab（标签页）| float（悬浮窗）
  calFloatRect: null,            // 悬浮日历的位置与尺寸
  calWeekStart: 1,
  calDualPick: "",               // 双月骨架里被点中的那一天
  calMonthDefault: "single",     // single | dual —— 用户要的「默认单月，双月可选」开关
  calShowGridLines: true,        // 网格线（参考图里淡灰细线）
  calWideCell: false,            // 单元格放宽（双月时自动开）               // 0 = 周日起，1 = 周一起

  /* ---- v3.1 新增：封面焦点 / 座右铭 / 头像 / 目录 ---- */
  showCoverPos: true,            // 允许拖动调整封面取景位置
  showMotto: false,              // 封面右侧座右铭框（默认关，设置里可开）
  motto: "",                     // 座右铭文本（可被单篇覆盖）
  mottoAlign: "left",            // left | center | right
  mottoSize: 15,                 // 座右铭字号
  showAvatar: false,             // 封面左下角头像/标志
  avatar: "",                    // 头像图片路径
  avatarText: "",                // 没图时的文字标记（留空则不显示）
  avatarSize: 44,
  avatarShape: "circle",           // circle|square|rounded|rect|capsule|diamond|hex|triangle
  /* 每个项目自己的字体与格子（用户：「我想让他们每个人都有自己的一份」）。
     留空 = 跟主题走；填了 = 这个项目单独用这一份，换主题也不被覆盖。 */
  projectVars: {
    dir: {},
  projectBg: { home: {}, dir: {}, cal: {}, float: {}, tl: {} },
  bgGlass: 12,
  cellBgMode: "follow",
  cellBgColor: "",
  cellBgImage: "",
  cellGlass: 8, cal: {}, float: {}, tl: {},
  },                // 头像直径
  treeTwoPane: true,             // 目录：上文件夹 / 下文件 双面板
  treePaneRatio: 0.42,           // 上方面板占比
  treeIconFolder: "folder",      // 文件夹图标
  treeIconFolderOpen: "folder-open",
  treeIconFile: "file-text",
  treeIconDaily: "calendar-days",
  treeShowBadge: true,           // 文件夹右侧数量徽标
  glassEnabled: false,           // 毛玻璃默认关（用户：谁用谁开）
  globalTableSnippet: false,     // 是否生成 .obsidian/snippets 片段

  // 以下为旧版 1.3.0 已有的设置，保留字段以便旧 data.json 原样迁移
  fontWeight: 400,
  background: "",
  splitRatio: 0.6,
  listLineStyle: "polyline",
  skipPermanentConfirm: false,
  fontDataUrl: "",
  fontFileName: "",
  fontDirFile: "",
  showRecentFiles: true,
  showTreeLines: true,
  treeDefaultOpen: true,
  treeSort: "folders",
  iconFile: "",
  iconFolder: "",
  iconFolderOpen: "",
  rightDockWidth: 0,
  activePreset: "",
  layoutPresets: [
    { name: "紧凑", columns: 2, rowHeight: 200, gap: 14, pad: 18, fontSize: 15, radius: 14 },
    { name: "宽松", columns: 2, rowHeight: 240, gap: 26, pad: 44, fontSize: 17, radius: 18 },
  ],
};

/* ============ 选本地文件 ============
 * 历史教训（2026-11-08）：
 *   1. createElement 后不 appendChild 就 click()，Chromium 不弹框 → 已修。
 *   2. 只有 change 监听、没有 cancel 结算 → 用户一取消，Promise 永远 pending；
 *      而 Obsidian 的 ButtonComponent 会 await 回调、期间一直挂着 mod-loading 转圈。
 *      「批量封面」和「日历底图」两处一模一样的转圈，根因就是这条链。
 *   3. 现在优先走 Electron 原生对话框（window.electron.remote.dialog，Obsidian 桌面版自带），
 *      拿不到再退回 input。两条路都会结算，绝不悬挂。 */

function nodeRequire(name) {
  try {
    if (typeof window === "undefined" || !window.require) return null;
    return window.require(name);
  } catch (e) { return null; }
}

/* accept 字符串 → 扩展名数组。image/* 这类去掉，只留能确定的 */
function extsFromAccept(accept) {
  const out = [];
  const seen = new Set();
  const push = (x) => { const v = String(x || "").toLowerCase().replace(/^\./, ""); if (v && !v.includes("*") && !seen.has(v)) { seen.add(v); out.push(v); } };
  const s = String(accept || "");
  for (const tok of s.split(",")) {
    const x = tok.trim().toLowerCase();
    if (!x) continue;
    if (x.startsWith(".")) push(x);
    else if (x.includes("/")) {
      const sub = x.split("/")[1];
      if (!sub || sub === "*") continue;
      push(sub.replace("jpeg", "jpg"));
    }
  }
  return out;
}

/* 原生对话框：返回绝对路径数组；不可用返回 null（交给 input 兜底） */
function nativeOpenSync(opts) {
  const o = opts || {};
  let dlg = null;
  try { dlg = window.electron && window.electron.remote && window.electron.remote.dialog; } catch (e) { dlg = null; }
  if (!dlg || typeof dlg.showOpenDialogSync !== "function") return null;
  const exts = extsFromAccept(o.accept);
  const props = ["openFile", "dontAddToRecent"];
  if (o.multiple) props.push("multiSelections");
  const args = { title: o.title || "选文件", properties: props };
  if (exts.length) args.filters = [{ name: "可选文件", extensions: exts }];
  try {
    const res = dlg.showOpenDialogSync(args);
    if (!res || !res.length) return [];
    return Array.prototype.slice.call(res);
  } catch (e) {
    console.warn("[格间日记] 原生选文件失败，改用浏览器选择：", e);
    return null;
  }
}

/* 绝对路径 → 便于上层直接使用的「类 File」对象（name / size / arrayBuffer） */
function fileInfoFromPath(p) {
  const fsMod = nodeRequire("node:original-fs") || nodeRequire("fs");
  const pathMod = nodeRequire("node:path");
  if (!fsMod || !pathMod) return null;
  try {
    const buf = fsMod.readFileSync(p);
    const name = pathMod.basename(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return {
      name,
      path: p,
      size: buf.byteLength,
      type: "",
      arrayBuffer: () => Promise.resolve(ab),
    };
  } catch (e) { return null; }
}

function chooseLocalFile(opts) {
  const o = opts || {};
  const native = nativeOpenSync({
    accept: o.accept, multiple: o.multiple,
    title: o.title || (o.multiple ? "选文件（可多选）" : "选文件"),
  });
  if (native) {
    const list = native.map(fileInfoFromPath).filter(Boolean);
    return Promise.resolve(o.multiple ? list : (list[0] || null));
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (o.accept) input.accept = o.accept;
    else input.removeAttribute("accept");
    if (o.multiple) input.multiple = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    let done = false;
    let timer = null;   /* 必须声明在 cleanup 之前，否则同步失败时读它会撞 TDZ */
    const cleanup = () => {
      if (done) return;
      done = true;
      try { input.remove(); } catch (e) { }
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const finish = (val) => { cleanup(); resolve(val); };
    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : [];
      finish(o.multiple ? files : (files[0] || null));
    });
    /* Chromium 113+ 的文件框取消事件：不接这一条，用户一取消就永久转圈 */
    input.addEventListener("cancel", () => finish(o.multiple ? [] : null));
    document.body.appendChild(input);
    try { input.click(); } catch (e) { finish(o.multiple ? [] : null); return; }
    /* 最后一道保险：极小概率两条事件都不来（例如被别的插件拦了），60 秒后结算掉 */
    timer = setTimeout(() => finish(o.multiple ? [] : null), 60000);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayStr() { return fmtDate(new Date()); }
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}
function shiftDate(s, delta) {
  const d = parseDate(s);
  d.setDate(d.getDate() + delta);
  return fmtDate(d);
}
function shiftMonth(s, delta) {
  const d = parseDate(s);
  const y = d.getFullYear(), m = d.getMonth() + delta;
  const ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  const day = Math.min(d.getDate(), last);
  return fmtDate(new Date(ny, nm, day));
}
function weekdayCN(s) { return "周" + WEEK_CN[parseDate(s).getDay()]; }
/* 年份写成汉字：「2026」→「二〇二六」 */
function cnYearLabel(y) {
  const map = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const s = String(y || "").replace(/[^0-9]/g, "");
  if (s.length !== 4) return "";
  let out = "";
  for (const ch of s) out += map[Number(ch)];
  return out + "年";
}
function dateCN(s) { const d = parseDate(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
function dateShort(s) { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; }
function monthKey(s) { return (s || "").slice(0, 7); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n) || lo)); }
function truncate(s, n) { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; }
function slug(s) { return String(s || "auto").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40); }
/* ---- 旧版「同一天多篇」：壹 贰 叁 … 拾壹 … 最多 99 篇 ----
 * 磁盘上就是 2026-10-18壹.md 这种文件名，必须原样认得、排序、续写。 */
const CN_DIGITS = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const CN_TEN = "拾";
const CN_SUFFIX_RE = /^[壹贰叁肆伍陆柒捌玖拾]+$/;
function cnNumber(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99) return "";
  if (n < 10) return CN_DIGITS[n - 1];
  const tens = Math.floor(n / 10), ones = n % 10;
  const head = tens === 1 ? CN_TEN : CN_DIGITS[tens - 1] + CN_TEN;
  return ones ? head + CN_DIGITS[ones - 1] : head;
}
function cnValue(s) {
  if (!s) return 0;
  if (!CN_SUFFIX_RE.test(s)) return Infinity;
  const idx = (ch) => CN_DIGITS.indexOf(ch) + 1;
  const p = s.indexOf(CN_TEN);
  if (p < 0) return idx(s) || Infinity;
  const tens = p === 0 ? 1 : idx(s.slice(0, p));
  const ones = p === s.length - 1 ? 0 : idx(s.slice(p + 1));
  if (tens < 1 || (p + 1 < s.length && ones < 1)) return Infinity;
  return tens * 10 + ones;
}
function nextCnSuffix(used) {
  const set = new Set(used);
  for (let i = 1; i <= 99; i++) { const s = cnNumber(i); if (s && !set.has(s)) return s; }
  return "";
}
function splitDayKey(key) {
  const m = /^(\d{4}-\d{2}-\d{2})([壹贰叁肆伍陆柒捌玖拾]+)?$/.exec(key || "");
  return m ? { date: m[1], suffix: m[2] || "" } : { date: (key || "").slice(0, 10), suffix: "" };
}
/* 新建日记时对自己写的 md 模板做纯文本替换（旧版 applyVars 等价实现） */
function fmtPattern(pattern, d) {
  const map = {
    YYYY: String(d.getFullYear()), MM: pad2(d.getMonth() + 1), DD: pad2(d.getDate()),
    HH: pad2(d.getHours()), mm: pad2(d.getMinutes()), ss: pad2(d.getSeconds()),
  };
  return String(pattern).replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
}
function applyVars(text, key, dateStr) {
  const d = parseDate(dateStr), now = new Date();
  return String(text || "").replace(/\{\{\s*(date|time|title)\s*(?::([^}]*))?\}\}/g, (_m, k, p) => {
    if (k === "title") return key;
    const pat = String(p || "").trim() || (k === "time" ? "HH:mm" : "YYYY-MM-DD");
    return fmtPattern(pat, k === "date" ? d : now);
  });
}
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function uid() { return "c" + Math.random().toString(36).slice(2, 9); }
function debounce(fn, ms) {
  let t = null;
  const f = function () {
    const args = arguments, ctx = this;
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(ctx, args); }, ms);
  };
  f.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return f;
}
/* 手机上的 click/contextmenu 没有可靠的鼠标坐标，菜单改为贴着触发按钮弹出 */
function showMenuAt(menu, evt) {
  if (IS_MOBILE) {
    const t = evt.currentTarget || evt.target;
    const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
    try { menu.showAtPosition({ x: r ? r.left : 80, y: r ? Math.min(r.bottom + 4, window.innerHeight - 60) : 120 }); return; }
    catch (e) { /* 老版本退回鼠标定位 */ }
  }
  menu.showAtMouseEvent(evt);
}
function mergeDefaults(saved, defaults) {
  const out = deepClone(defaults);
  if (!saved || typeof saved !== "object") return out;
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined || saved[k] === null) continue;
    out[k] = saved[k];
  }
  return out;
}
/* 把 v1.x / v2.x 的 data.json 迁移到 v3 字段。
 * 关键点：v1 的实际观感是「手账纸感」（cardOpacity 0.3 + 楷体 + 纸纹），
 * 旧配置里没有 theme 字段，所以迁移时必须显式写成 paper，否则会被
 * mergeDefaults 填成 card，用户升级后主题会「莫名其妙变白」。 */
function migrateSettings(saved) {
  const s = mergeDefaults(saved, DEFAULT_SETTINGS);
  if (!saved || typeof saved !== "object") return s;
  const v = Number(saved.version) || 1;
  /* v3.23：按色结构整体删除后，老 data.json 里的字段会被 mergeDefaults 原样带回来。
     这里统一清掉，免得「设置里已经没有入口、内存里还留着旧值」这两套并行。 */
  for (const dead of ["bgRhythm", "bgByDay", "bgByWeek", "bgByMonth", "timelineColorDiff", "diffColorMigrated"]) {
    if (dead in s) delete s[dead];
  }
  if (s.projectBg && typeof s.projectBg === "object") {
    for (const k of Object.keys(s.projectBg)) {
      const box = s.projectBg[k];
      if (!box || typeof box !== "object") continue;
      for (const dead of ["rhythm", "byDay", "byWeek", "byMonth"]) {
        if (dead in box) delete box[dead];
      }
    }
  }
  /* v3.24：日历底图从「四摆位」收成「横幅 / 铺满」。
     老值 left-top / right-bottom / both 是压在日历上的那三种（就是用户说的重叠），
     一律转成 banner；full 保留。
     另外 banner 是新的默认，老存档里如果从没设过摆位，也统一成 banner。 */
  if (!(s.calWallWallMigrated)) {
    const legacyCorners = ["left-top", "right-bottom", "both"];
    if (legacyCorners.indexOf(s.calWallpaperPos) >= 0) s.calWallpaperPos = "banner";
    else if (s.calWallpaperPos !== "full") s.calWallpaperPos = "banner";
    s.calWallWallMigrated = true;
  }
  if (v >= 3) return s;

  const fromV1 = v < 2;
  if (fromV1) {
    /* v1 → v3：主题按实际观感补成纸感；字号小、页边距小、列少 */
    s.theme = saved.theme || "paper";
    if (saved.columns) s.columns = clamp(saved.columns, 1, 6);
    if (saved.cellHeight) s.rowHeight = clamp(saved.cellHeight, 80, 600);
    if (saved.gridGap) s.gap = clamp(saved.gridGap, 0, 48);
    if (saved.contentPad) s.pad = clamp(saved.contentPad, 4, 64);
    if (saved.pluginFontSize) s.fontSize = clamp(saved.pluginFontSize, 10, 26);
    if (saved.fontFamily) s.fontFamily = saved.fontFamily;
    if (saved.customCss) s.customCss = saved.customCss;
    if (saved.leftWidth) s.sidebarWidth = clamp(saved.leftWidth, 160, 420);
    if (saved.showLeftPanel === false) s.showSidebar = false;
    if (Array.isArray(saved.templates)) {
      s.templates = saved.templates.map((t) => ({
        name: t.name || "未命名模板",
        cells: Array.isArray(t.cells) ? t.cells : (t.titles || []).map((title) => ({ title, cs: 1, rs: 1, h: 0, accent: "" })),
      }));
    }
    s.activeTemplate = saved.defaultTemplate || saved.activeTemplate || s.templates[0].name;
  } else {
    /* v2 → v3：主题已是明确字段，原样保留 */
    if (saved.theme) s.theme = saved.theme;
  }
  s.version = 3;
  return s;
}

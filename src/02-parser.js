/* ============ 日记文件 ⇄ 格子模型 · 纯文本粘贴解析 ============
 * 磁盘格式与 v1 完全兼容：frontmatter + # 日期 + ## 格子标题 + 正文
 * 布局元数据写在结尾的 gd-layout 注释里，普通 Markdown 阅读器会自动忽略，
 * 且会跟着 md 文件一起同步到手机，不会像外部 json 那样丢配置。
 * ============================================================ */

function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || "");
  return m ? { fm: m[1], body: text.slice(m[0].length) } : { fm: "", body: text || "" };
}
function readLayout(body) {
  const m = LAYOUT_RE.exec(body);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch (e) { return null; }
}
function stripLayout(body) { return body.replace(LAYOUT_RE, "").trim(); }

function parseDay(text, level) {
  const lv = clamp(level || 2, 2, 4);
  const sp = splitFrontmatter(text);
  const layout = readLayout(sp.body);
  let body = stripLayout(sp.body).replace(/\r\n?/g, "\n");
  let h1 = "";
  const m = /^#\s+(.+)\n/.exec(body);
  if (m) { h1 = m[1].trim(); body = body.slice(m[0].length); }

  const cells = [];
  const re = new RegExp(`^#{${lv}}\\s+(.+?)\\s*$`, "gm");
  const marks = [];
  let hit;
  while ((hit = re.exec(body)) !== null) marks.push({ title: hit[1].trim(), start: hit.index, end: re.lastIndex });

  if (!marks.length) {
    cells.push({ title: "日记", content: body.trim() });
  } else {
    const pre = body.slice(0, marks[0].start).trim();
    if (pre) cells.push({ title: "前言", content: pre });
    for (let i = 0; i < marks.length; i++) {
      const seg = body.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : body.length).trim();
      cells.push({ title: marks[i].title, content: seg });
    }
  }
  return { fm: sp.fm, h1, cells, layout };
}

/* 把磁盘格子与布局元数据合并成运行期格子对象 */
function normalizeCells(cells, layout, settings) {
  const defs = (layout && Array.isArray(layout.cells)) ? layout.cells : [];
  const maxCols = settings.mobileOneColumn && IS_MOBILE ? 1 : clamp(settings.columns, 1, 6);
  const defBorder = (layout && layout.border) || settings.defaultBorder || "hair";
  return cells.map((c, i) => {
    const d = defs[i] || {};
    return {
      id: uid(),
      title: c.title || `格子 ${i + 1}`,
      content: c.content || "",
      cs: clamp(d.cs || 1, 1, maxCols),
      rs: clamp(d.rs || 1, 1, 6),
      h: clamp(d.h || 0, 0, 1200),
      accent: d.accent || "",
      collapsed: !!d.collapsed,
      border: d.border || defBorder,
      sticker: d.sticker || "",
    };
  });
}

/* v3 布局元数据：在 v2 基础上增加整篇的皮肤/封面/贴纸，以及单格的边框与贴纸。
 * 全部塞进同一条 HTML 注释里 —— 普通 Markdown 阅读器会忽略它，
 * 而且它跟着 md 文件走，同步到手机不会丢。 */
function normalizeLayout(layout, settings) {
  const l = layout || {};
  return {
    skin: l.skin || settings.skin || "zebra",
    border: l.border || settings.defaultBorder || "hair",
    cover: l.cover || "",
    coverHeight: Number.isFinite(l.coverHeight) ? clamp(l.coverHeight, 0, 320) : clamp(settings.coverHeight || 160, 0, 320),
    stickers: Array.isArray(l.stickers) ? l.stickers.filter((x) => typeof x === "string").slice(0, 5) : [],
    coverPos: typeof l.coverPos === "string" ? l.coverPos : "",
    motto: typeof l.motto === "string" ? l.motto : "",
    avatar: typeof l.avatar === "string" ? l.avatar : "",
    photo: typeof l.photo === "string" ? l.photo : "",
    layers: normalizeLayers(l.layers, l, settings),
    crops: normalizeCrops(l.crops),
  };
}

/* 裁剪框：{ cover:{x,y,w,h}, photo:{...} } 都是原图百分比 */
const CROP_FITS = ["center", "fill", "fit", "stretch", "tile", "raw"];

function normalizeCrop(c) {
  if (!c || typeof c !== "object") return null;
  const fit = CROP_FITS.includes(c.fit) ? c.fit : "";
  /* 拉伸 / 平铺 / 原图 不需要坐标，只有 fit 也能成立 */
  const w = clamp(Number(c.w) || 0, 1, 100);
  const h = clamp(Number(c.h) || 0, 1, 100);
  if (!(w > 0) || !(h > 0)) {
    return fit && fit !== "center" && fit !== "fill" ? { x: 0, y: 0, w: 100, h: 100, fit } : null;
  }
  const out = {
    x: clamp(Number(c.x) || 0, 0, 100 - w),
    y: clamp(Number(c.y) || 0, 0, 100 - h),
    w: Math.round(w * 10) / 10,
    h: Math.round(h * 10) / 10,
  };
  if (fit) out.fit = fit;
  return out;
}

function normalizeCrops(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of ["cover", "photo", "bg"]) {
    const c = normalizeCrop(src[k]);
    if (c) out[k] = c;
  }
  return out;
}

/* 把四层坐标夹到 0–100，缺层用默认值补
 * 老格式没有 layers 时：cover 有图 → bg 开；座右铭有字 → text 开；avatar 有值 → mark 开 */
function normalizeLayers(raw, lay, settings) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : null;
  for (const k of LAYER_KEYS) {
    const d = DEFAULT_LAYERS[k];
    const v = (src && src[k]) || null;
    const o = {
      x: clamp(Number.isFinite(v && v.x) ? v.x : d.x, 0, 100),
      y: clamp(Number.isFinite(v && v.y) ? v.y : d.y, 0, 100),
      w: clamp(Number.isFinite(v && v.w) ? v.w : d.w, 2, 100),
      h: clamp(Number.isFinite(v && v.h) ? v.h : d.h, 2, 100),
      on: v && typeof v.on === "boolean" ? v.on : d.on,
    };
    out[k] = o;
  }
  if (!src) {
    /* 老日记折算：不改变视觉，只是把原来的摆位翻译成四层 */
    const l2 = lay || {};
    out.bg.on = !!l2.cover || (settings && settings.showCover !== false);
    out.text.on = !!(l2.motto || (settings && settings.showMotto));
    out.mark.on = !!(l2.avatar || (settings && settings.showAvatar));
    out.img.on = false;
  }
  /* 老默认摆位把座右铭放在 y=58 高 30，正好压在头像（y=82）上。
   * 用户抱怨「座右铭被绑在头像旁边」，这里把还停在老位置的一次性挪到左上。
   * 只要用户自己拖过（x/y 不是老默认值），就不动。 */
  const T = out.text;
  if (T && T.x === 4 && T.y === 58 && T.w === 52 && T.h === 30) {
    T.x = 4; T.y = 8; T.w = 56; T.h = 26;
  }
  return out;
}

function serializeDay(date, cells, state) {
  const fm = state.fm || "";
  const extra = fm.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(date|source)\s*:/i.test(l));
  const lay = state.layout || {};
  /* 先算好整篇边框：cells.map 会在 layout 赋值前执行，直接读 layout.border 会撞 TDZ */
  const baseBorder = lay.border || state.border || "hair";
  const layout = {
    v: 3,
    cols: state.columns,
    skin: lay.skin || state.skin || "zebra",
    border: baseBorder,
    cover: lay.cover || state.cover || "",
    coverHeight: clamp(lay.coverHeight != null ? lay.coverHeight : (state.coverHeight != null ? state.coverHeight : 160), 0, 320),
    stickers: (lay.stickers || state.stickers || []).slice(0, 5),
    coverPos: lay.coverPos || "",
    motto: lay.motto || "",
    avatar: lay.avatar || "",
    photo: lay.photo || "",
    layers: lay.layers || state.layers || null,
    crops: (function () {
      const src = lay.crops || state.crops || null;
      const out = {};
      if (src && typeof src === "object") {
        for (const k of ["cover", "photo", "bg"]) {
          if (src[k] && src[k].w > 0) out[k] = src[k];
        }
      }
      return Object.keys(out).length ? out : null;
    })(),
    cells: cells.map((c) => {
      const o = { cs: c.cs, rs: c.rs, h: c.h, accent: c.accent || "", collapsed: !!c.collapsed };
      if (c.border && c.border !== baseBorder) o.border = c.border;
      if (c.sticker) o.sticker = c.sticker;
      return o;
    }),
  };
  if (!layout.coverPos) delete layout.coverPos;
  if (!layout.motto) delete layout.motto;
  if (!layout.avatar) delete layout.avatar;
  if (!layout.photo) delete layout.photo;
  if (!layout.layers) delete layout.layers;
  if (!layout.crops) delete layout.crops;
  const mark = "#".repeat(clamp(state.level || 2, 2, 4));
  const out = ["---", `date: ${date}`, "source: 格间日记", ...extra, "---", "", `# ${state.h1 || date}`, ""];
  for (const c of cells) {
    out.push(`${mark} ${String(c.title || "未命名").trim()}`, "");
    const body = String(c.content || "").trim();
    if (body) out.push(body, "");
  }
  out.push(`<!-- gd-layout ${JSON.stringify(layout)} -->`, "");
  return out.join("\n");
}

/* 用自己的 md 文件当模板（旧版 dailyTemplatePath 的行为）：
 * 只做 {{date}} / {{date:格式}} / {{time}} / {{time:格式}} / {{title}} 纯文本替换，
 * 其余内容原样写入，不改写用户的模板。 */
function buildFromMdTemplate(key, date, text) {
  return applyVars(text, key, date).replace(/\s*$/, "") + "\n";
}

/* 用模板生成一篇新日记 */
function buildFromTemplate(date, template, level, opts) {
  const o = opts || {};
  const mark = "#".repeat(clamp(level || 2, 2, 4));
  const tplCells = template.cells || [];
  const cells = tplCells.map((c) => ({
    id: uid(), title: c.title,
    /* 模板可以只存骨架（mode=titles），也可以连内容一起存（mode=content）。
     * o.blank = true 时不带内容（"只保留标题"）。 */
    content: (template.mode === "content" && !o.blank && typeof c.content === "string") ? c.content : "",
    cs: clamp(c.cs || 1, 1, 6), rs: clamp(c.rs || 1, 1, 6),
    h: c.h || 0, accent: c.accent || "", collapsed: false,
    border: c.border || "", sticker: c.sticker || "",
  }));
  const md = [
    "---", `date: ${date}`, "source: 格间日记", "---", "", `# ${date}`, "",
    ...cells.flatMap((c) => [`${mark} ${c.title}`, "", ...(c.content ? [c.content, ""] : [])]),
    `<!-- gd-layout ${JSON.stringify({ v: 2, cells: cells.map((c) => ({ cs: c.cs, rs: c.rs, h: c.h, accent: c.accent })) })} -->`, "",
  ].join("\n");
  return { cells, md };
}

/* 从当前这篇的格子提取一个模板（用户要求："根据已有内容提取模板"） */
function extractTemplate(name, cells, withContent) {
  return {
    name,
    mode: withContent ? "content" : "titles",
    cells: (cells || []).map((c) => {
      const o = {
        title: c.title, cs: c.cs || 1, rs: c.rs || 1,
        h: c.h || 0, accent: c.accent || "",
      };
      if (c.border) o.border = c.border;
      if (c.sticker) o.sticker = c.sticker;
      if (withContent) o.content = c.content || "";
      return o;
    }),
  };
}

/* ---------- 纯文本 → 分段 ---------- */

const HEADING_PATTERNS = [
  /* 「13:24 今日事件」——时间戳开头 + 短标题。
   * 有些 AI / 手写模板会把每个小标题前面加上吐司时间，这种不能算正文。 */
  { family: "time", re: /^(\d{1,2}[:：]\d{2})\s+(\S.{0,23})$/ },
  { family: "md", re: /^#{1,6}\s+(.+?)\s*#*\s*$/ },
  { family: "bracket2", re: /^【(.+?)】\s*$/ },
  { family: "bracket1", re: /^\[(.+?)\]\s*$/ },
  { family: "colon", re: /^(.{1,22}?)\s*[：:]\s*(.*)$/ },
];
function matchHeading(line) {
  const t = String(line || "").trim();
  if (!t) return null;
  for (const p of HEADING_PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    /* time 家族：第 1 组是时间戳，第 2 组才是标题；时间戳稍后并回正文 */
    const title = String((p.family === "time" ? m[2] : m[1]) || "").trim();
    if (!title || title.length > 24) continue;
    if (p.family === "time" && /[。！？，,；;]/.test(title)) continue;
    if (/[。！？，,；;]/.test(title) || /^https?$/i.test(title) || title.includes("//")) continue;
    /* 「今天做了三件事：」这种是引导句不是标题：
     * 冒号家族额外要求标题里不能有空格、不能以数字/列表符号开头，
     * 且原文冒号后不能紧跟长段落（那种更像「名词：解释」）。 */
    if (p.family === "colon") {
      if (/^[\d\-*+·•\s]/.test(title)) continue;
      if (/\s/.test(title)) continue;
      const after = String(m[2] || "");
      if (after.length > 60) continue;
    }
    const inline = p.family === "colon" ? String(m[2] || "").trim() : "";
    return { title, inline, family: p.family, stamp: p.family === "time" ? String(m[1] || "") : "" };
  }
  return null;
}

function parseTable(src) {
  const lines = src.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (lines.length < 2) return [];
  const rows = lines.map((l) => l.slice(1, -1).split("|").map((s) => s.trim()));
  const data = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  if (data.length < 2) return [];
  const head = data[0], body = data.slice(1);
  return head.map((h, i) => ({
    title: h || `第 ${i + 1} 列`,
    content: body.map((r) => (i === 0 ? (r[0] || "") : `${r[0] || ""}：${r[i] || ""}`)).filter(Boolean).join("\n"),
  }));
}

/* 标题归一化：用来判断"两个标题是不是同一个"。
 * 会去掉开头的时间戳（13:24 / 22:15）、编号（1、/ 一、）、markdown 记号与首尾空白。
 * 只用于比对与合并，落盘的标题仍是原文。 */
function normHeadKey(title) {
  let s = String(title || "").trim();
  s = s.replace(/^\d{1,2}[:：]\d{2}\s*/, "");          // 13:24 今日事件
  s = s.replace(/^[\[【(（]?\d{1,2}[:：]\d{2}[\]】)）]?\s*/, "");
  s = s.replace(/^[0-9０-９]+[.、)\s]+/, "");              // 1. / 1、 / 1)
  s = s.replace(/^[（(][一二三四五六七八九十\d]+[）)]\s*/, ""); // （一）
  s = s.replace(/^第[一二三四五六七八九十\d]+[格篇节部分]\s*/, "");
  s = s.replace(/[*_#\s\u3000]/g, "");
  return s.toLowerCase();
}

/* 同名合并：把被切碎的同名标题合回一格（用户报的"同一个标题没写完就新增一个"）
 * 保留第一次出现的顺序与原始标题，后面的内容按出现顺序接到后面。 */
function mergeByTitle(cells) {
  const out = [];
  const map = new Map();
  for (const c of cells) {
    const key = normHeadKey(c.title);
    if (key && map.has(key)) {
      const host = map.get(key);
      const add = String(c.content || "").trim();
      if (add) host.content = host.content ? host.content.replace(/\s+$/, "") + "\n\n" + add : add;
      continue;
    }
    const cell = { title: c.title, content: String(c.content || "").trim() };
    out.push(cell);
    if (key) map.set(key, cell);
  }
  return out;
}

function parseHeadings(src) {
  const lines = src.split("\n");
  /* 先扫一遍看哪种写法出现得最多：用户写了 ## 就只按 ## 切，
   * 正文里偶然出现的「名词：解释」不该再被当标题切开。 */
  const tally = {};
  for (const line of lines) {
    const h = matchHeading(line);
    if (h) tally[h.family] = (tally[h.family] || 0) + 1;
  }
  let dominant = "";
  let best = 0;
  for (const [f, n] of Object.entries(tally)) if (n > best) { best = n; dominant = f; }

  const out = [];
  let cur = null;
  for (const line of lines) {
    const h = matchHeading(line);
    const isHeading = h && (!dominant || h.family === dominant);
    if (isHeading) {
      /* 时间戳不丢：它并回正文第一行（用户写「13:24 今日事件」时那个时间是有效信息） */
      const head = [];
      if (h.stamp) head.push(h.stamp);
      if (h.inline) head.push(h.inline);
      cur = { title: h.title, content: head };
      out.push(cur);
    } else if (cur) {
      cur.content.push(line);
    } else if (line.trim()) {
      cur = { title: "开头", content: [line] };
      out.push(cur);
    }
  }
  /* 时间戳单独占一行太难看了（"13:24\n\n数学两个重要极限"），
   * 并到它下面第一条非空内容的行首："13:24 数学两个重要极限" */
  const cells = out.map((c) => ({ title: c.title, content: c.content.join("\n").trim() }));
  for (const c of cells) {
    c.content = c.content.replace(/^(\d{1,2}[:：]\d{2})\s*\n+\s*(?=\S)/, "$1 ");
  }
  return mergeByTitle(cells);
}

function parseBlank(src, firstLineAsTitle) {
  const chunks = src.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const cells = chunks.map((chunk, i) => {
    const lines = chunk.split("\n");
    const first = lines[0].trim();
    const useAsTitle = firstLineAsTitle && lines.length > 1 && first.length <= 24 && !/[。！？.!?]$/.test(first) && !matchHeading(first);
    return {
      title: useAsTitle ? first : `片段 ${i + 1}`,
      content: useAsTitle ? lines.slice(1).join("\n").trim() : chunk,
    };
  });
  return mergeByTitle(cells);
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function parseSeparator(src, sep, firstLineAsTitle) {
  if (!sep) return [];
  const pattern = "^\\s*" + escapeRe(sep) + "\\s*$";
  const parts = src.split(new RegExp(pattern, "m")).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parseBlank(parts.join("\n\n"), firstLineAsTitle) : [];
}

/* ============ 粘贴过滤（A5）============
 * 用户在设置里可以：
 *   pasteKeepFrom      : 从这一行开始才算内容（"今日事件"以下全保留）
 *   pasteKeepKeywords  : 只保留含这些词的分段（空 = 不启用）
 *   pasteDropKeywords  : 丢掉含这些词的分段
 *   pasteFormatFilter  : all / text（去 Markdown 记号）/ plain（去图片与链接）
 *   pasteKeepHeadingOnly: 只留标题行，正文丢掉（做模板骨架用）
 * ======================================== */
function applyPasteFilters(text, opts) {
  let s = String(text == null ? "" : text);
  const o = opts || {};

  /* 从某一行开始截取 */
  const from = String(o.pasteKeepFrom || "").trim();
  if (from) {
    const lines = s.split(/\r?\n/);
    let hit = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(from) >= 0) { hit = i; break; }
    }
    if (hit >= 0) s = lines.slice(hit).join("\n");
  }

  /* 格式过滤 */
  const fmt = o.pasteFormatFilter || "all";
  if (fmt === "text") {
    s = s
      .replace(/!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g, "$1")
      .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, "$1")
      .replace(/\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g, "$1")
      .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, "$1")
      .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "");
  } else if (fmt === "plain") {
    s = s
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[\[[^\]]*\]\]/g, "")
      .replace(/https?:\/\/\S+/g, "");
  }

  /* 只留标题行 */
  if (o.pasteKeepHeadingOnly) {
    const kept = [];
    for (const line of s.split(/\r?\n/)) {
      if (matchHeading(line)) kept.push(line);
    }
    if (kept.length) s = kept.join("\n");
  }

  /* 关键词保留 / 丢弃（按分段） */
  const keep = (o.pasteKeepKeywords || []).map((x) => String(x).trim()).filter(Boolean);
  const drop = (o.pasteDropKeywords || []).map((x) => String(x).trim()).filter(Boolean);
  if (keep.length || drop.length) {
    const segs = s.split(/\n{2,}/);
    const out = [];
    for (const seg of segs) {
      if (!seg.trim()) continue;
      if (keep.length && !keep.some((k) => seg.indexOf(k) >= 0)) continue;
      if (drop.length && drop.some((k) => seg.indexOf(k) >= 0)) continue;
      out.push(seg);
    }
    if (out.length) s = out.join("\n\n");
  }
  return s;
}

function parsePaste(text, mode, opts) {
  text = applyPasteFilters(text, opts);
  const o = opts || {};
  const src = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!src) return [];
  const m = mode || "auto";
  if (m === "raw") return [{ title: "粘贴内容", content: src }];
  if (m === "table") return parseTable(src);
  if (m === "headings") return parseHeadings(src);
  if (m === "blank") return parseBlank(src, o.pasteFirstLineAsTitle !== false);

  /* auto：标题优先。
   * 之前用「谁分出的块多谁赢」打分，结果只要有空行，parseBlank 就能刷出
   * 一堆「片段 N」把标题方案顶掉——用户明明写了 ## 标题，却得到碎片。
   * 现在：认出 ≥2 个标题就直接按标题切；只有 1 个标题且全文都在它下面也照办。 */
  const byHeading = parseHeadings(src);
  const realHeadings = byHeading.filter((c) => c.title && c.title !== "开头");
  if (realHeadings.length >= 2) return byHeading;
  if (realHeadings.length === 1 && byHeading.length === 1) return byHeading;

  const byTable = parseTable(src);
  if (byTable.length >= 2) return byTable;
  const bySep = parseSeparator(src, o.pasteSeparator, o.pasteFirstLineAsTitle !== false);
  if (bySep.length >= 2) return bySep;
  const byBlank = parseBlank(src, o.pasteFirstLineAsTitle !== false);
  return byBlank.length ? byBlank : [{ title: "粘贴内容", content: src }];
}

/* 旧版 images-to-html / images-to-wiki 命令的纯文本内核。
 * 关键修正：只认图片后缀。日记目录里确实有 .epub 附件，旧版会把它错转成 <img>。 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
function convertImageText(data, toHtml, folder) {
  let count = 0;
  const text = String(data || "").replace(/<img\b[^>]*>|!\[\[[^\]]+\]\]/gi, (all) => {
    if (toHtml) {
      const m = /^!\[\[([^\]|#]+?)(?:\|(\d+))?\]\]$/.exec(all);
      if (!m) return all;
      const n = m[1].trim();
      if (!IMAGE_EXT_RE.test(n)) return all;
      count++;
      const src = normalizePath(`${folder || "日记"}/attachments/${n}`);
      return `<img src="${src}"${m[2] ? ` width="${m[2]}"` : ""}>`;
    }
    const s = /\bsrc="([^"]+)"/i.exec(all);
    if (!s) return all;
    const w = /\bwidth="(\d+)"/i.exec(all);
    const base = s[1].split("/").pop();
    if (!IMAGE_EXT_RE.test(base)) return all;
    count++;
    return `![[${base}${w ? `|${w[1]}` : ""}]]`;
  });
  return { text, count };
}

function applyPaste(cells, segments, target) {
  const picked = segments.filter((s) => !s.__skip).map((s) => ({
    id: uid(), title: String(s.title || "未命名").trim(), content: String(s.content || ""),
    cs: 1, rs: 1, h: 0, accent: "", collapsed: false,
  }));
  if (target === "append") return cells.concat(picked);
  if (target === "merge") {
    const out = cells.slice();
    for (const p of picked) {
      const i = out.findIndex((c) => c.title === p.title);
      if (i >= 0) out[i] = { ...out[i], content: (out[i].content ? out[i].content.trim() + "\n\n" : "") + p.content };
      else out.push(p);
    }
    return out;
  }
  return picked;
}

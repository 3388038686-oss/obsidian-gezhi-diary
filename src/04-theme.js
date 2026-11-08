/* ═══════════════════════════════════════════════════════════
 * 主题系统（v4）
 * -----------------------------------------------------------
 * 一个主题 = 一个 JSON 文件，放在 库/主题/<名字>.json
 * 文件里带 version / note / updatedAt / changes（修改记录）
 * 每次保存自动留一份到 库/主题/.history/<名字>@<时间戳>.json
 *
 * 设计目标（按用户要求）：
 *   1. 主题单独存一份文件，方便备份 / 跨设备迁移
 *   2. 带版本号和备注，回滚时看得清哪次改了什么
 *   3. 一个主题管多个项目，切项目自动套
 *   4. 新建项目时能选预设
 * ═══════════════════════════════════════════════════════════ */

const THEME_DEFAULT_DIR = "主题";
const THEME_HISTORY_DIR = ".history";
const THEME_SCHEMA = 4;

/* 主题里能存哪些 token。分组只为设置页好排，落盘是平的。 */
const THEME_GROUPS = [
  ["bg", "底色", [
    ["bgMode", "底色形态", "color|gradient|image|texture", "color"],
    ["bgColor", "底色", "color", "#ffffff"],
    ["bgGradient", "渐变", "text", ""],
    ["bgImage", "底图", "text", ""],
    ["bgTexture", "纹理", "texture", "none"],
  ]],
  ["font", "字体", [
    ["fontFamily", "字族", "text", ""],
    ["fontSize", "字号", "number", 15],
    ["fontColor", "字色", "color", ""],
    ["lineHeight", "行高", "number", 1.7],
    ["letterSpacing", "字距", "number", 0],
    ["fontWeight", "字重", "number", 400],
  ]],
  ["line", "线体", [
    ["lineColor", "线色", "color", ""],
    ["lineWidth", "线宽", "number", 1],
    ["lineStyle", "线型", "lineStyle", "solid"],
  ]],
  ["icon", "图标", [
    ["iconStyle", "图标风格", "iconStyle", "dot"],
  ]],
  ["cell", "格子", [
    ["skin", "风格", "theme", "card"],
    ["border", "边框", "border", "none"],
    ["radius", "圆角", "number", 14],
    ["gap", "间距", "number", 14],
    ["pad", "内边距", "number", 20],
    ["accent", "强调色", "color", "#c2704f"],
    ["cardOpacity", "不透明度", "number", 1],
  ]],
  ["type", "排版", [
    ["paraIndent", "首行缩进", "number", 2],
    ["paraGap", "段落间距", "number", 0.8],
    ["paraFontGap", "标题下距", "number", 0.5],
  ]],
  ["motion", "动效", [
    ["hoverLift", "悬停抬起", "bool", true],
  ]],
];

/* 扁平化：{ bgMode: {...}, fontFamily: {...} } */
const THEME_SPEC = {};
for (const [, , list] of THEME_GROUPS) {
  for (const [key, label, type, def] of list) THEME_SPEC[key] = { label, type, def };
}

/* 六套内置预设（用户批准的草案名） */
/* 用户要的三套补充强调色（黑白灰 / dsh 蓝 / claude 橙） */
const ACCENT_PRESETS = [
  ["accent-mono", "黑白灰", "#4a4a4a"],
  ["accent-dsh", "dsh 蓝", "#4d6bfe"],
  ["accent-claude", "claude 橙", "#d97757"],
];

const THEME_PRESETS = [
  {
    id: "xuanzhi", name: "宣纸", note: "米黄底色 + 楷体，最像纸质手账",
    tokens: { bgMode: "color", bgColor: "#f7f3ea", fontFamily: '"LXGW WenKai","Kaiti SC","STKaiti",楷体,serif"',
      fontSize: 16, lineHeight: 1.9, fontColor: "#3b342c", lineColor: "#c9bda8", lineWidth: 1,
      skin: "paper", border: "none", radius: 10, gap: 16, pad: 22, accent: "#a8744a",
      paraIndent: 2, paraGap: 0.9, paraFontGap: 0.6, hoverLift: true, iconStyle: "dot" },
  },
  {
    id: "minimal", name: "极简白", note: "纯白无装饰，字最清楚",
    tokens: { bgMode: "color", bgColor: "#ffffff", fontFamily: "", fontSize: 15, lineHeight: 1.75,
      fontColor: "", lineColor: "#e6e6e6", lineWidth: 1, skin: "mono", border: "hair", radius: 6,
      gap: 12, pad: 18, accent: "#333333", paraIndent: 2, paraGap: 0.8, paraFontGap: 0.5,
      hoverLift: false, iconStyle: "dot" },
  },
  {
    id: "yehang", name: "夜航", note: "深蓝底浅字，晚上看不刺眼",
    tokens: { bgMode: "color", bgColor: "#1c2230", fontFamily: "", fontSize: 15, lineHeight: 1.85,
      fontColor: "#d9dee8", lineColor: "#333c4e", lineWidth: 1, skin: "card", border: "none",
      radius: 12, gap: 14, pad: 20, accent: "#7aa2d6", paraIndent: 2, paraGap: 0.85,
      paraFontGap: 0.55, hoverLift: true, iconStyle: "dot" },
  },
  {
    id: "shouzhang", name: "手账", note: "方格纸 + 便当格，格子有边界",
    tokens: { bgMode: "texture", bgColor: "#fffdf7", bgTexture: "graph", fontFamily: "",
      fontSize: 15, lineHeight: 1.8, fontColor: "#2f2a24", lineColor: "#ddd2c0", lineWidth: 1,
      skin: "bento", border: "hair", radius: 16, gap: 18, pad: 22, accent: "#e08a5f",
      paraIndent: 2, paraGap: 0.8, paraFontGap: 0.5, hoverLift: true, iconStyle: "emoji" },
  },
  {
    id: "zazhi", name: "杂志", note: "大留白 + 大日期，适合配图",
    tokens: { bgMode: "color", bgColor: "#fbfbf9", fontFamily: "", fontSize: 15, lineHeight: 1.7,
      fontColor: "#1f1f1f", lineColor: "#e8e8e4", lineWidth: 1, skin: "magazine", border: "none",
      radius: 4, gap: 20, pad: 28, accent: "#2b2b2b", paraIndent: 0, paraGap: 1,
      paraFontGap: 0.6, hoverLift: false, iconStyle: "none" },
  },
  {
    id: "biandang", name: "便当", note: "圆角卡片 + 彩色强调，格子分明",
    tokens: { bgMode: "gradient", bgColor: "#f4f6f9",
      bgGradient: "linear-gradient(160deg,#f4f6f9 0%,#eef2f7 100%)", fontFamily: "", fontSize: 15,
      lineHeight: 1.72, fontColor: "", lineColor: "#dfe4ec", lineWidth: 1, skin: "bento",
      border: "none", radius: 20, gap: 16, pad: 20, accent: "#5b8def", paraIndent: 2,
      paraGap: 0.8, paraFontGap: 0.5, hoverLift: true, iconStyle: "dot" },
  },
];

function themeStamp(d) {
  const x = d || new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}-${p(x.getHours())}${p(x.getMinutes())}${p(x.getSeconds())}`;
}

function themeSafeName(s) {
  return String(s || "未命名").replace(/[\\/:*?"<>|#^[\]]/g, "_").slice(0, 40) || "未命名";
}

class ThemeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.cache = new Map();
  }
  get app() { return this.plugin.app; }
  get vault() { return this.app.vault; }
  get s() { return this.plugin.settings; }

  get dir() {
    return normalizePath(String(this.s.themeDir || THEME_DEFAULT_DIR).replace(/^\/+|\/+$/g, ""));
  }
  get historyDir() { return normalizePath(this.dir + "/" + THEME_HISTORY_DIR); }

  path(name) { return normalizePath(this.dir + "/" + themeSafeName(name) + ".json"); }

  async ensureDir() {
    await this.plugin.ensureFolder(this.dir);
    await this.plugin.ensureFolder(this.historyDir);
  }

  /* 读一个主题文件；不存在返回 null */
  async read(name) {
    const p = this.path(name);
    try {
      const f = this.vault.getAbstractFileByPath(p);
      if (!f) return null;
      const text = await this.vault.read(f);
      const j = JSON.parse(text);
      if (!j || typeof j !== "object") return null;
      return this.normalize(j, name);
    } catch (e) {
      console.warn("[格间日记] 读主题失败", name, e);
      return null;
    }
  }

  /* 补全缺字段，保证老文件也能用 */
  normalize(j, fallbackName) {
    const t = Object.assign({}, j);
    t.id = t.id || themeSafeName(fallbackName);
    t.name = t.name || fallbackName || "未命名";
    t.version = Number(t.version) || 1;
    t.note = t.note || "";
    t.updatedAt = t.updatedAt || "";
    if (!Array.isArray(t.changes)) t.changes = [];
    const tok = Object.assign({}, t.tokens || {});
    for (const key of Object.keys(THEME_SPEC)) {
      if (tok[key] === undefined || tok[key] === null || tok[key] === "") {
        if (tok[key] === undefined) tok[key] = THEME_SPEC[key].def;
      }
    }
    t.tokens = tok;
    return t;
  }

  /* 列出全部主题（按名字排序） */
  async list() {
    const out = [];
    try {
      const folder = this.vault.getAbstractFileByPath(this.dir);
      if (!folder || !folder.children) return out;
      for (const ch of folder.children) {
        if (!ch || ch.extension !== "json") continue;
        const t = await this.read(ch.basename);
        if (t) out.push(t);
      }
    } catch (e) { console.warn("[格间日记] 列主题失败", e); }
    out.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"));
    return out;
  }

  /* 保存（自动 +1 版本，写 changes，留历史） */
  async save(name, tokens, note) {
    await this.ensureDir();
    const old = (await this.read(name)) || { version: 0, changes: [] };
    const now = new Date();
    const merged = Object.assign({}, tokens || {});
    const next = {
      id: themeSafeName(name),
      name: name,
      version: (Number(old.version) || 0) + 1,
      note: note || "",
      updatedAt: now.toISOString().slice(0, 19),
      changes: (old.changes || []).concat([{
        rev: (Number(old.version) || 0) + 1,
        at: now.toISOString().slice(0, 19),
        note: note || "保存",
      }]).slice(-50),
      tokens: Object.assign({}, old.tokens || {}, merged),
    };
    /* 先留历史（拿的是「改之前」的版本） */
    if (old.version) await this.snapshot(old);

    const p = this.path(name);
    const text = JSON.stringify(next, null, 2);
    const f = this.vault.getAbstractFileByPath(p);
    if (f) await this.vault.modify(f, text);
    else await this.vault.create(p, text);
    this.cache.set(name, next);
    return next;
  }

  async snapshot(t) {
    try {
      await this.ensureDir();
      const p = normalizePath(this.historyDir + "/" + themeSafeName(t.name) + "@" + themeStamp() + ".json");
      if (this.vault.getAbstractFileByPath(p)) return;
      await this.vault.create(p, JSON.stringify(t, null, 2));
    } catch (e) { console.warn("[格间日记] 主题历史写入失败", e); }
  }

  /* 某主题的历史版本列表（新→旧） */
  async history(name) {
    const out = [];
    try {
      const folder = this.vault.getAbstractFileByPath(this.historyDir);
      if (!folder || !folder.children) return out;
      const prefix = themeSafeName(name) + "@";
      for (const ch of folder.children) {
        if (!ch || ch.extension !== "json") continue;
        if (!ch.basename.startsWith(prefix)) continue;
        const stamp = ch.basename.slice(prefix.length);
        let rev = 0, note = "";
        try {
          const j = JSON.parse(await this.vault.read(ch));
          rev = Number(j.version) || 0;
          note = j.note || "";
        } catch (e) { /* 坏文件跳过 */ }
        out.push({ path: ch.path, name: ch.basename, stamp, rev, note });
      }
    } catch (e) { console.warn("[格间日记] 列主题历史失败", e); }
    out.sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
    return out;
  }

  /* 回滚：把某个历史快照重新写回主题文件（本身也记一条 change） */
  async rollback(name, histPath) {
    const f = this.vault.getAbstractFileByPath(normalizePath(histPath));
    if (!f) { new Notice("找不到那个历史版本"); return null; }
    let j;
    try { j = JSON.parse(await this.vault.read(f)); }
    catch (e) { new Notice("历史文件损坏：" + e.message); return null; }
    const cur = (await this.read(name)) || { version: 0, changes: [] };
    /* 先把当前存一份，免得回滚后想反悔 */
    await this.snapshot(cur);
    const now = new Date();
    const next = {
      id: themeSafeName(name),
      name: name,
      version: (Number(cur.version) || 0) + 1,
      note: "回滚到 " + (j.version || "?") + " 版",
      updatedAt: now.toISOString().slice(0, 19),
      changes: (cur.changes || []).concat([{
        rev: (Number(cur.version) || 0) + 1,
        at: now.toISOString().slice(0, 19),
        note: "回滚到 " + (j.version || "?") + " 版（" + (j.note || "无备注") + "）",
      }]).slice(-50),
      tokens: Object.assign({}, j.tokens || {}),
    };
    const p = this.path(name);
    const text = JSON.stringify(next, null, 2);
    const cur_file = this.vault.getAbstractFileByPath(p);
    if (cur_file) await this.vault.modify(cur_file, text);
    else await this.vault.create(p, text);
    this.cache.set(name, next);
    return next;
  }

  /* 把主题的 tokens 套进 settings，并立即生效 */
  async apply(name, silent) {
    const t = await this.read(name);
    if (!t) { if (!silent) new Notice("主题「" + name + "」不存在"); return null; }
    Object.assign(this.s, tokensToSettings(t.tokens));
    this.s.activeTheme = name;
    await this.plugin.saveSettings();
    this.plugin.applyAllTheme?.();
    if (!silent) new Notice("已套用主题：" + t.name);
    return t;
  }

  /* 从当前 settings 抓一份 tokens */
  grab() {
    const out = {};
    for (const key of Object.keys(THEME_SPEC)) {
      if (this.s[key] !== undefined) out[key] = this.s[key];
    }
    return out;
  }

  /* 把预设写成文件（只在文件不存在时创建，不覆盖用户改过的） */
  async installPresets() {
    await this.ensureDir();
    let n = 0;
    for (const p of THEME_PRESETS) {
      const f = this.vault.getAbstractFileByPath(this.path(p.name));
      if (f) continue;
      const now = new Date().toISOString().slice(0, 19);
      const body = {
        id: p.id, name: p.name, version: 1, note: p.note, updatedAt: now,
        changes: [{ rev: 1, at: now, note: "内置预设" }],
        tokens: Object.assign({}, THEME_SPEC_DEFAULTS(), p.tokens),
      };
      await this.vault.create(this.path(p.name), JSON.stringify(body, null, 2));
      n++;
    }
    return n;
  }
}

/* 主题默认值表（给预设补全用） */
function THEME_SPEC_DEFAULTS() {
  const out = {};
  for (const key of Object.keys(THEME_SPEC)) out[key] = THEME_SPEC[key].def;
  return out;
}

/* tokens → settings 片段（只映射主题管得着的键） */
function tokensToSettings(tok) {
  const out = {};
  const map = {
    skin: "skin", border: "defaultBorder", radius: "radius", gap: "gap", pad: "pad",
    accent: "accent", cardOpacity: "cardOpacity",
    fontFamily: "fontFamily", fontSize: "fontSize", fontColor: "fontColor",
    lineHeight: "lineHeight", letterSpacing: "letterSpacing", fontWeight: "fontWeight",
    lineColor: "lineColor", lineWidth: "lineWidth", lineStyle: "lineStyle",
    iconStyle: "treeIconStyle",
    paraIndent: "paraIndent", paraGap: "paraGap", paraFontGap: "paraFontGap",
    hoverLift: "hoverLift",
    bgMode: "bgMode", bgColor: "bgColor", bgGradient: "bgGradient",
    bgImage: "bgImage", bgTexture: "bgTexture",
  };
  for (const k of Object.keys(tok)) {
    const sk = map[k];
    if (sk) out[sk] = tok[k];
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════
 * 主题版本历史（用户要求：回滚时看得清哪次改了什么，
 * 也方便对着编号沟通）
 * ═══════════════════════════════════════════════════════════ */
class ThemeHistoryModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.picked = plugin.settings.activeTheme || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-root");
    contentEl.addClass("gd-modal");
    contentEl.createEl("h3", { text: "主题版本历史" });

    const all = contentEl.createDiv({ cls: "gd-set-row" });
    all.createSpan({ cls: "gd-set-name", text: "主题" });
    const sel = all.createEl("select", { cls: "dropdown" });
    this.plugin.themes.list().then((list) => {
      sel.empty?.();
      for (const t of list) {
        const o = sel.createEl("option", { text: t.name + "（当前 v" + t.version + "）" });
        o.value = t.name;
        if (t.name === this.picked) o.selected = true;
      }
      if (!list.length) sel.createEl("option", { text: "（没有主题文件）" });
      this.drawList();
    });
    sel.onchange = () => { this.picked = sel.value; this.drawList(); };

    this.listEl = contentEl.createDiv({ cls: "gd-theme-hist" });
    const foot = contentEl.createDiv({ cls: "gd-modal-btns" });
    const closeBtn = foot.createEl("button", { text: "关闭", cls: "gd-btn" });
    closeBtn.onclick = () => this.close();
  }

  async drawList() {
    const el = this.listEl;
    if (!el) return;
    el.empty();
    if (!this.picked) {
      el.createDiv({ cls: "gd-set-hint", text: "还没有主题，先在格子里「⋯ → 主题」存一个。" });
      return;
    }
    const cur = await this.plugin.themes.read(this.picked);
    const curBox = el.createDiv({ cls: "gd-theme-now" });
    curBox.createSpan({ cls: "gd-theme-badge", text: "当前 v" + (cur ? cur.version : "?") });
    curBox.createSpan({ cls: "gd-theme-note", text: cur ? (cur.note || "（无备注）") : "" });
    if (cur) curBox.createSpan({ cls: "gd-theme-time", text: cur.updatedAt || "" });

    const hist = await this.plugin.themes.history(this.picked);
    if (!hist.length) {
      el.createDiv({ cls: "gd-set-hint", text: "还没有历史版本。每次「把当前改动存回主题」都会自动留一份。" });
    }

    /* 主文件自己的修改记录（changes） */
    if (cur && Array.isArray(cur.changes) && cur.changes.length) {
      el.createEl("h4", { text: "改动记录（最近的在上）" });
      const box = el.createDiv({ cls: "gd-theme-changes" });
      for (const c of cur.changes.slice().reverse()) {
        const row = box.createDiv({ cls: "gd-theme-change" });
        row.createSpan({ cls: "gd-theme-badge", text: "#" + String(c.rev).padStart(2, "0") });
        row.createSpan({ cls: "gd-theme-time", text: c.at || "" });
        row.createSpan({ cls: "gd-theme-note", text: c.note || "" });
      }
    }

    if (hist.length) {
      el.createEl("h4", { text: "可以回滚的快照" });
      for (const h of hist) {
        const row = el.createDiv({ cls: "gd-theme-hist-row" });
        row.createSpan({ cls: "gd-theme-badge", text: "v" + (h.rev || "?") });
        row.createSpan({ cls: "gd-theme-time", text: h.stamp.replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3 $4:$5:$6") });
        row.createSpan({ cls: "gd-theme-note", text: h.note || "" });
        const btn = row.createEl("button", { cls: "gd-mini-btn", text: "回滚到这个" });
        btn.onclick = async () => {
          const ok = await confirmModal(this.app, "回滚主题",
            "把「" + this.picked + "」回滚到 v" + (h.rev || "?") + "？\n当前版本会先存一份，回滚后也能反悔。");
          if (!ok) return;
          const r = await this.plugin.themes.rollback(this.picked, h.path);
          if (r) {
            await this.plugin.themes.apply(this.picked, true);
            this.plugin.applyAllTheme();
            new Notice("已回滚，现在是 v" + r.version);
            this.drawList();
          }
        };
      }
    }
  }

  onClose() { this.contentEl.empty(); }
}

/* 简易确认框（返回 Promise<boolean>），复用已有 ConfirmModal 思路 */
function confirmModal(app, title, body) {
  return new Promise((resolve) => {
    const m = new Modal(app);
    m.onOpen = () => {
      const el = m.contentEl;
      el.addClass("gd-root");
      el.createEl("h3", { text: title });
      el.createEl("p", { text: body });
      const foot = el.createDiv({ cls: "gd-modal-btns" });
      const no = foot.createEl("button", { text: "取消", cls: "gd-btn" });
      no.onclick = () => { m.close(); resolve(false); };
      const yes = foot.createEl("button", { text: "确定", cls: "gd-btn mod-cta" });
      yes.onclick = () => { m.close(); resolve(true); };
    };
    m.onClose = () => m.contentEl.empty();
    m.open();
  });
}

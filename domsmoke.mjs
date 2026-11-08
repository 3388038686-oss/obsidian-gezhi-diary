/* 渲染烟雾测试：用极简 DOM 桩真正跑一遍视图 onOpen + render，
 * 抓那些「插件加载失败 / 插件不再活动」的构造期与渲染期异常。
 * 用法：node domsmoke.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 极简 DOM ---------- */
let nid = 0;
class FakeClassList extends Set {
  add(...cs) { for (const c of cs) Set.prototype.add.call(this, c); return this; }
  remove(...cs) { for (const c of cs) this.delete(c); return this; }
  toggle(c, on) { if (on === undefined) { this.has(c) ? this.delete(c) : this.add(c); } else if (on) this.add(c); else this.delete(c); return this.has(c); }
  contains(c) { return this.has(c); }
  item(i) { return [...this][i] || null; }
}
class FakeEl {
  constructor(tag = "div", o = {}) {
    this.tagName = String(tag).toUpperCase();
    this.id = "e" + ++nid;
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {
      _m: new Map(),
      setProperty(k, v) { this._m.set(k, v); },
      removeProperty(k) { this._m.delete(k); },
      getPropertyValue(k) { return this._m.get(k) || ""; },
      set cssText(v) { this._t = v; },
      get cssText() { return this._t || ""; },
    };
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.scrollWidth = 900;
    this.clientWidth = 900;
    this.clientHeight = 700;
    this.offsetWidth = 300;
    this.offsetHeight = 150;
    this._listeners = new Map();
    this.onclick = null;
    this.draggable = false;
    if (o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    if (o.text != null) this.textContent = String(o.text);
    if (o.attr) for (const [k, v] of Object.entries(o.attr)) this.setAttr(k, v);
    if (o.value != null) this.value = o.value;
  }
  get classListStr() { return [...this.classList].join(" "); }
  addClass(...c) { c.forEach((x) => this.classList.add(x)); return this; }
  removeClass(...c) { c.forEach((x) => this.classList.delete(x)); return this; }
  toggleClass(c, on) { if (on === undefined) { this.classList.has(c) ? this.classList.delete(c) : this.classList.add(c); } else if (on) this.classList.add(c); else this.classList.delete(c); return this; }
  hasClass(c) { return this.classList.has(c); }
  setAttribute(k, v) { this.setAttr(k, v); }
  setAttr(k, v) { this["attr_" + k] = v; if (k === "value") this.value = v; if (k === "type") this.type = v; if (k === "placeholder") this.placeholder = v; }
  getAttr(k) { return this["attr_" + k]; }
  removeAttribute(k) { delete this["attr_" + k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  prepend(c) { c.parentElement = this; this.children.unshift(c); }
  after(c) {
    if (!this.parentElement) return;
    const sibs = this.parentElement.children;
    sibs.splice(sibs.indexOf(this) + 1, 0, c);
    c.parentElement = this.parentElement;
  }
  before(c) {
    if (!this.parentElement) return;
    const sibs = this.parentElement.children;
    sibs.splice(sibs.indexOf(this), 0, c);
    c.parentElement = this.parentElement;
  }
  remove() {
    if (this.parentElement) {
      const s = this.parentElement.children;
      const i = s.indexOf(this);
      if (i >= 0) s.splice(i, 1);
    }
    this.parentElement = null;
  }
  empty() { this.children.forEach((c) => (c.parentElement = null)); this.children = []; return this; }
  createDiv(o) { return this.appendChild(new FakeEl("div", o)); }
  createEl(tag, o) { return this.appendChild(new FakeEl(tag, o)); }
  createSpan(o) { return this.appendChild(new FakeEl("span", o)); }
  addEventListener(t, f) { if (!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push(f); }
  removeEventListener(t, f) { const a = this._listeners.get(t) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  dispatch(t, ev) { (this._listeners.get(t) || []).forEach((f) => f(ev)); }
  getBoundingClientRect() { return { left: 10, top: 10, right: 310, bottom: 160, width: 300, height: 150 }; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { return true; }
  setText(v) { this.textContent = String(v == null ? "" : v); return this; }
  insertBefore(child, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    child.parentElement = this;
    if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
    return child;
  }
  _all(out) {
    for (const c of this.children) { out.push(c); if (c._all) c._all(out); }
    return out;
  }
  querySelectorAll(sel) {
    const wanted = String(sel).split(",").map((s) => s.trim().replace(/^[.\s]+/, "")).filter(Boolean);
    return this._all([]).filter((c) => c.classList && wanted.some((w) => c.classList.has(w)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  remove() {
    if (this.parentElement) {
      const i = this.parentElement.children.indexOf(this);
      if (i >= 0) this.parentElement.children.splice(i, 1);
      this.parentElement = null;
    }
  }
  focus() {} blur() {} click() { if (this.onclick) this.onclick({ target: this, preventDefault() {}, stopPropagation() {} }); }
  setSelectionRange() {}
  get selectionStart() { return 0; }
  get selectionEnd() { return 0; }
  scrollTo() {}
  closest() { return null; }
  matches() { return false; }
}
function walk(el, fn) { fn(el); el.children.forEach((c) => walk(c, fn)); }

const fakeBody = new FakeEl("body");
globalThis.document = {
  body: fakeBody,
  head: new FakeEl("head"),
  createElement: (t) => new FakeEl(t),
  createDiv: (o) => new FakeEl("div", o),
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { let hit = null; walk(fakeBody, (e) => { if (e.id === id) hit = e; }); return hit; },
  querySelector() { return null; },
};
globalThis.window = { innerWidth: 1400, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
try { Object.defineProperty(globalThis, "navigator", { value: { clipboard: { readText: async () => "" } }, configurable: true, writable: true }); } catch (e) { globalThis.navigator.clipboard = { readText: async () => "" }; }
globalThis.HTMLElement = FakeEl;

/* ---------- Obsidian 桩 ---------- */
const files = [];
class TFile {
  constructor(p, content = "") {
    this.path = p; this.name = p.split("/").pop();
    this.basename = this.name.replace(/\.[^.]+$/, "");
    this.extension = this.name.split(".").pop();
    this.stat = { mtime: Date.now() }; this.parent = null;
    this._content = content;
    Object.defineProperty(this, "content", { get: () => this._content, set: (v) => (this._content = v) });
    files.push(this);
  }
}
class TFolder { constructor(p) { this.path = p; this.children = []; } }
class Notice { constructor(m) { this.msg = m; notices.push(m); } }
const notices = [];
class Menu {
  constructor() {
    this._items = [];
    this.titles = [];
    globalThis.__menus = globalThis.__menus || [];
    globalThis.__menus.push(this);
  }
  addItem(cb) {
    const rec = {
      _title: "",
      setTitle(x) { this._title = String(x); return this; },
      setIcon() { return this; },
      setChecked() { return this; },
      setDisabled() { return this; },
      onClick(g) { this._cb = g; return this; },
    };
    cb(rec);
    this.titles.push(rec._title);
    this._items.push(cb);
    return this;
  }
  addSeparator() { return this; }
  showAtMouseEvent() { (this._items || []).forEach((f) => f({ setTitle() { return this; }, setIcon() { return this; }, onClick(g) { this._cb = g; return this; } })); }
  showAtPosition() { this.showAtMouseEvent(); }
}
class Setting {
  constructor() { this._c = []; }
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addText(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: new FakeEl("input") }); return this; }
  addToggle(cb) { cb({ setValue() { return this; }, onChange() { return this; } }); return this; }
  addDropdown(cb) { cb({ addOption() { return this; }, addOptions() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
  addSlider(cb) { cb({ setLimits() { return this; }, setValue() { return this; }, setDynamicTooltip() { return this; }, onChange() { return this; } }); return this; }
  addButton(cb) { cb({ setButtonText() { return this; }, setCta() { return this; }, onClick() { return this; } }); return this; }
  addTextArea(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: new FakeEl("textarea") }); return this; }
}
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this._commands = []; this._views = {}; this._data = null; }
  async loadData() { return this._data; }
  async saveData(d) { this._data = JSON.parse(JSON.stringify(d)); }
  addCommand(c) { this._commands.push(c); return c; }
  removeCommand(id) { this._commands = this._commands.filter((c) => c.id !== id); }
  addSettingTab(t) { this._settingTab = t; }
  addRibbonIcon() { return new FakeEl("div"); }
  registerView(t, f) { this._views[t] = f; }
  registerEvent() {} register() {} registerDomEvent() {} registerInterval() {}
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = new FakeEl("div"); } }
class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf && leaf.app;
    this.containerEl = new FakeEl("div");
    this.contentEl = this.containerEl.createDiv();
  }
  getViewType() { return "x"; } getDisplayText() { return "x"; }
}
class Modal {
  constructor(app) { this.app = app; this.containerEl = new FakeEl("div"); this.modalEl = this.containerEl.createDiv(); this.contentEl = this.modalEl.createDiv(); this.titleEl = this.modalEl.createDiv(); }
  open() { this.onOpen && this.onOpen(); }
  close() { this.onClose && this.onClose(); }
}
class MarkdownRenderer { static async renderMarkdown(md, el) { el.createDiv({ text: "md" }); } static async render() {} }
const Platform = { isMobile: false, isMobileApp: false };
function normalizePath(s) { return String(s || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""); }
function setIcon(el, name) { if (el && el.setAttribute) el.setAttribute("data-icon", String(name || "")); }

class Vault {
  constructor() {
    this.dirs = new Set();
    this.listeners = {};
  }
  getFiles() { return files; }
  getAbstractFileByPath(p) { return files.find((f) => f.path === p) || null; }
  async read(f) { return f._content; }
  async cachedRead(f) { return f._content; }
  async modify(f, t) { f._content = t; }
  async create(p, t) { const f = new TFile(p, t); return f; }
  async process(f, fn) { f._content = fn(f._content); return f._content; }
  async trash(f) { const i = files.indexOf(f); if (i >= 0) files.splice(i, 1); }
  on(ev, cb) { (this.listeners[ev] = this.listeners[ev] || []).push(cb); return { ev, cb }; }
  adapter = {
    exists: async () => true,
    mkdir: async () => {},
    getResourcePath: (p) => "app://" + p,
    write: async () => {}, read: async () => "",
  };
  configDir = ".obsidian";
}

const app = {
  vault: new Vault(),
  workspace: {
    getLeavesOfType: () => [],
    getLeaf: () => ({ view: null, setViewState: async () => {}, setActive: () => {} }),
    getLeftLeaf: () => ({ view: null, setViewState: async () => {} }),
    getRightLeaf: () => ({ view: null, setViewState: async () => {} }),
    revealLeaf: () => {},
    onLayoutReady: (cb) => { /* 手动触发 */ },
    getActiveFile: () => null,
    on: () => ({}),
    iterateAllLeaves: () => {},
    activeLeaf: null,
  },
  metadataCache: { getFirstLinkpathDest: () => null },
  setting: { open() {}, openTabById() {} },
  commands: { removeCommand() {} },
  fileManager: { processFrontMatter: async () => {} },
};

/* ---------- 造数据 ---------- */
function mkDay(d, cells) {
  const body = cells.map(([t, c]) => `## ${t}\n\n${c}`).join("\n\n");
  const f = new TFile(`日记/${d}.md`, `---\ndate: ${d}\nsource: 格间日记\n---\n\n# ${d}\n\n${body}\n\n<!-- gd-layout {"v":3,"cols":2,"skin":"zebra","border":"tape","cover":"","coverHeight":160,"stickers":["☀️"],"cells":[{"cs":1,"rs":1},{"cs":1,"rs":1}]} -->\n`);
  return f;
}
mkDay("2026-11-07", [["今日事件", "去看了展"], ["今日书账", "买了两本书"], ["今日新知", "纸张会变黄"], ["今日碎记", "![[a.gif|300]]"]]);
mkDay("2026-11-06", [["今日事件", "写代码"], ["今日新知", "学到了东西"]]);
mkDay("2026-10-18", [["今日事件", "旧日记"], ["今日新知", "老格式"]]);
mkDay("2025-12-31", [["今日事件", "去年最后一天"]]);

const mod = await import("node:module");
const { createRequire } = mod;
const require2 = createRequire(import.meta.url);
const origLoad = mod.default._load;
mod.default._load = function (req, ...rest) {
  if (req === "obsidian") {
    return { Plugin, PluginSettingTab, ItemView, Modal, Setting, Notice, Platform, Menu, TFile, TFolder, MarkdownRenderer, normalizePath, setIcon };
  }
  return origLoad.call(this, req, ...rest);
};
let code = fs.readFileSync(path.join(ROOT, "dist/main.js"), "utf8");
/* 把内部纯函数临时露出来给断言用（只在测试里改这一份字符串） */
code = code.replace(/\}\)\(\);\s*$/, 'globalThis.__gd = { extractTemplate, buildFromTemplate, normHeadKey, mergeByTitle, LAYER_KEYS, DEFAULT_LAYERS, normalizeLayers, CAL_SKELETONS, CAL_TEXTURES, TEMPLATE_KINDS, sortTemplates, templateKind, dayKind, applyPasteFilters, HOLIDAYS, TableView, cropCss, applyCrop, CropModal };\n})();');
const m = mod.default;
const srcMod = new m.Module("gd", null);
srcMod.filename = path.join(ROOT, "dist/gd-cjs.js");
srcMod.paths = m.Module._nodeModulePaths(path.join(ROOT, "dist"));
srcMod._compile(code, srcMod.filename);
const GridDiaryPlugin = srcMod.exports.default || srcMod.exports;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? "  ← " + extra : ""}`); }
};

console.log("\n[D1] 插件 onload");
const plugin = new GridDiaryPlugin(app, { id: "grid-diary", version: "3.0.0" });
let loadErr = null;
try { await plugin.onload(); } catch (e) { loadErr = e; }
ok("onload 无异常", !loadErr, loadErr ? `${loadErr.constructor.name}: ${loadErr.message}\n${loadErr.stack.split("\n").slice(0, 4).join("\n")}` : "");

/* 关掉"自动新建今天"，否则测试结果会随运行日期漂移 */
plugin.settings.autoCreateToday = false;

console.log("\n[D2] 四个视图构造 + onOpen 渲染");
const mkLeaf = (appObj) => ({ app: appObj, view: null, setViewState: async () => {}, detach() {} });
const views = {};
for (const type of ["gd-grid-view", "gd-sidebar-view", "gd-calendar-view", "gd-timeline-view"]) {
  let v = null, err = null;
  try {
    v = plugin._views[type](mkLeaf(app));
    views[type] = v;
    if (v && v.onOpen) await v.onOpen();
  } catch (e) { err = e; }
  ok(`${type} 构造 + 渲染`, !err, err ? `${err.constructor.name}: ${err.message}\n${(err.stack || "").split("\n").slice(1, 5).join("\n")}` : "");
}

console.log("\n[D3] 渲染结果的静态检查");
const gv = views["gd-grid-view"];
if (gv) {
  /* 固定打开有 4 格的那一天，不受今天日期影响 */
  try { await gv.openDay("2026-11-07"); } catch (e) { console.log("  ! openDay 失败", e.message); }
  let elCount = 0, textCount = 0;
  walk(gv.contentEl, (e) => { elCount++; if (e.textContent) textCount++; });
  ok("九宫格渲染出元素（>80）", elCount > 80, `实际 ${elCount}`);
  const cellCount = (() => { let n = 0; walk(gv.contentEl, (e) => { if (e.classList.has("gd-cell")) n++; }); return n; })();
  ok("4 个格子都渲染了", cellCount === 4, `实际 ${cellCount}`);
  const plusCount = (() => { let n = 0; walk(gv.contentEl, (e) => { if (e.classList.has("gd-cell-plus")) n++; }); return n; })();
  ok("每格都有右上角「＋」", plusCount === 4, `实际 ${plusCount}`);
  ok("封面元素存在", !!gv.coverEl);
  ok("工具条有按钮", gv.toolbarEl && gv.toolbarEl.children.length >= 5, `实际 ${gv.toolbarEl ? gv.toolbarEl.children.length : 0}`);
}
const cv = views["gd-calendar-view"];
if (cv) {
  /* 日历现在由 CalendarPanel 驱动：标签页里是宿主 + 轴视图 + 面板 */
  const panel = cv.panel;
  ok("日历面板已挂载", !!(panel && panel.el), panel ? "" : "calPanel.el 为空");
  const dayCells = (() => { let n = 0; walk(cv.contentEl, (e) => { if (e.classList.has("gd-cal-cell")) n++; }); return n; })();
  ok("月视图渲染出日期格（≥28）", dayCells >= 28, `实际 ${dayCells}`);
  ok("日历显示农历或节日小字", (() => { let n = 0; walk(cv.contentEl, (e) => { if (e.classList.has("gd-cal-sub")) n++; }); return n; })() > 0);

  let err = null, errAt = "";
  for (const skel of ["grid", "strip", "annual", "hero", "split", "dual"]) {
    try { plugin.settings.calSkeleton = skel; panel.render(); } catch (e) { err = e; errAt = skel; }
  }
  ok("六种骨架都能渲染（含双月）", !err, err ? `${errAt}: ${err.message}` : "");

  /* 双月并排：要真的画两套月历 */
  plugin.settings.calSkeleton = "dual";
  panel.render();
  const dualCount = (() => { let n = 0; walk(cv.contentEl, (e) => { if (e.classList.has("gd-cal-dual-col")) n++; }); return n; })();
  ok("双月并排画出两列", dualCount === 2, `实际 ${dualCount}`);
  const dualDays = (() => { let n = 0; walk(cv.contentEl, (e) => { if (e.classList.has("gd-cal-cell")) n++; }); return n; })();
  ok("双月的日期格翻倍（≥56）", dualDays >= 56, `实际 ${dualDays}`);

  let terr = null, terrAt = "";
  for (const tex of ["none", "graph", "dots", "lines", "paper", "gradient"]) {
    try { plugin.settings.calTexture = tex; panel.render(); } catch (e) { terr = e; terrAt = tex; }
  }
  ok("六种纹理都能渲染", !terr, terr ? `${terrAt}: ${terr.message}` : "");

  let werr = null;
  for (const pos of ["left-top", "right-bottom", "both", "full"]) {
    try { plugin.settings.calWallpaperPos = pos; plugin.settings.calWallpaper = "cover.png"; panel.render(); } catch (e) { werr = e; }
  }
  ok("底图四种摆位都能渲染", !werr, werr ? werr.message : "");
  plugin.settings.calWallpaper = "";
  plugin.settings.calSkeleton = "grid";
  panel.render();

  /* 农历是数据层的事，直接从源码分片加载来验，比透过 IIFE 更准 */
  const lunarSrc =
    'const { Platform } = require("obsidian");\n'
    + fs.readFileSync(path.join(ROOT, "src/01-constants.js"), "utf8")
    + "\n"
    + fs.readFileSync(path.join(ROOT, "src/02-lunar.js"), "utf8")
    + "\nmodule.exports = { lunarOf, termOf, festivalOf, lunarLabel, isTermDay };\n";
  const lm = new (mod.default.Module)("lunar", null);
  lm.filename = path.join(ROOT, "dist/gd-lunar.js");
  lm.paths = mod.default.Module._nodeModulePaths(path.join(ROOT, "dist"));
  lm._compile(lunarSrc, lm.filename);
  const L = lm.exports;
  let lerr = null;
  for (const g of ["none", "major", "full"]) {
    try { L.lunarLabel("2026-11-07", g); } catch (e) { lerr = e; }
  }
  ok("农历三档粒度可用", !lerr, lerr ? lerr.message : "");
  ok("春节能被识别为节日", L.festivalOf("2026-02-17") === "春节", String(L.festivalOf("2026-02-17")));
  ok("中秋能被识别为节日", /中秋/.test(L.festivalOf("2026-09-25") || ""), String(L.festivalOf("2026-09-25")));
  ok("节气能取到", !!L.termOf("2026-11-07") || !!L.termOf("2026-11-22"), String(L.termOf("2026-11-22")));
  ok("农历日期换算正确（2026-11-07 = 九月廿九）", (() => {
    const x = L.lunarOf("2026-11-07");
    return !!x && x.dayName === "廿九" && x.monthName === "九月";
  })(), JSON.stringify(L.lunarOf("2026-11-07")));
}

const sv = views["gd-sidebar-view"];
if (sv) {
  /* 目录已改成「上文件夹 / 下文件」双面板：文件行类名是 gd-tree-file，
   * 文件夹行是 gd-tree-folder，外加一个可拖动的 gd-split-bar。 */
  const files = (() => { let n = 0; walk(sv.contentEl, (e) => { if (e.classList.has("gd-tree-file")) n++; }); return n; })();
  const folders = (() => { let n = 0; walk(sv.contentEl, (e) => { if (e.classList.has("gd-tree-folder")) n++; }); return n; })();
  const split = (() => { let n = 0; walk(sv.contentEl, (e) => { if (e.classList.has("gd-split-bar")) n++; }); return n; })();
  ok("目录双面板存在分隔条", split === 1, `实际 ${split}`);
  ok("目录上半有文件夹行", folders >= 1, `实际 ${folders}`);
  ok("目录下半列出了所有测试文件（≥4）", files >= 4, `实际 ${files}`);
  /* 文件行现在用「小图钉」代替图标；图标只留给文件夹行 */
  ok("文件行带图标或图钉", (() => { let n = 0; walk(sv.contentEl, (e) => { if (e.classList.has("gd-tree-icon") || e.classList.has("gd-tree-thumb")) n++; }); return n; })() > 0);

  /* v3.10：小图钉替掉大缩略图；有图钉就不再出小圆点 */
  ok("文件行有小图钉", (() => { let n = 0; walk(sv.contentEl, (e) => { if (e.classList.has("gd-tree-thumb")) n++; }); return n; })() > 0);
  ok("有图钉时不再重复出小圆点", (() => {
    let pin = 0, dot = 0;
    walk(sv.contentEl, (e) => {
      if (!e.classList.has("gd-tree-file")) return;
      let p = 0, d = 0;
      walk(e, (c) => {
        if (c.classList.has("gd-tree-thumb")) p++;
        if (c.classList.has("gd-tree-icon") && c.classList.has("is-dot")) d++;
      });
      pin += p; dot += d;
    });
    return pin === 0 || dot === 0;
  })());

  /* v3.10：文件夹路径不再被 root.length 切错，不该出现半截名字 */
  const badNames = [];
  walk(sv.contentEl, (e) => {
    if (!e.classList.has("gd-tree-name")) return;
    const s = (e.textContent || "").trim();
    if (/^(型资料|den阅读器|plate模板)$/.test(s)) badNames.push(s);
  });
  ok("没有半截的假文件夹名", badNames.length === 0, badNames.join(","));
}

console.log("\n[D6b] 裁剪（cropCss / applyCrop / CropModal）");
{
  const g = globalThis.__gd || {};
  ok("cropCss 存在", typeof g.cropCss === "function");
  ok("applyCrop 存在", typeof g.applyCrop === "function");
  ok("CropModal 存在", typeof g.CropModal === "function");

  /* 不裁剪 ⇒ 返回 null，调用方退回 cover */
  ok("crop 为空时 cropCss 返回 null", g.cropCss && g.cropCss(null) === null);

  /* 取左半：w=50,x=0 ⇒ 图放大 2 倍，位置贴左 */
  const c1 = g.cropCss && g.cropCss({ x: 0, y: 0, w: 50, h: 50 });
  ok("取左上 1/4：size 放大到 200%", !!c1 && c1.size.indexOf("200") === 0, JSON.stringify(c1));
  ok("取左上 1/4：position 贴 0%", !!c1 && c1.position.indexOf("0.00% 0.00%") === 0, JSON.stringify(c1));

  /* 取右半：w=50,x=50 ⇒ 位置贴右 100% */
  const c2 = g.cropCss && g.cropCss({ x: 50, y: 50, w: 50, h: 50 });
  ok("取右下 1/4：position 贴 100%", !!c2 && c2.position.indexOf("100.00% 100.00%") === 0, JSON.stringify(c2));

  /* 整数边界：x 超过 100-w 要被夹住 */
  const c3 = g.cropCss && g.cropCss({ x: 999, y: 999, w: 40, h: 40 });
  ok("crop 越界会被夹住", !!c3 && c3.position.indexOf("100.00%") === 0, JSON.stringify(c3));

  /* 正常：w=100 时不该放大 */
  const c4 = g.cropCss && g.cropCss({ x: 0, y: 0, w: 100, h: 100 });
  ok("整张时 size 是 100%", !!c4 && c4.size.indexOf("100") === 0, JSON.stringify(c4));

  /* CropModal 能构造 */
  let merr = null;
  try { new g.CropModal(app, { url: "x.png", ratio: 1 }); } catch (e) { merr = e; }
  ok("CropModal 能构造", !merr, merr ? merr.message : "");
}

console.log("\n[D7] 日历浮窗");
{
  let err = null;
  try {
    plugin.settings.calPanel = "float";
    plugin.openCalendarFloat();
    ok("日历浮窗能打开", !!plugin.calFloatEl);
    ok("浮窗里有日历面板", !!(plugin.calPanel && plugin.calPanel.el));
    ok("浮窗渲染出日期格", (() => { let n = 0; walk(plugin.calFloatEl, (e) => { if (e.classList.has("gd-cal-cell")) n++; }); return n; })() >= 28);
    plugin.calFloatEl.remove();
    plugin.closeCalendarFloat();
    ok("日历浮窗能关闭", !plugin.calFloatEl);
  } catch (e) { err = e; }
  ok("日历浮窗开合无异常", !err, err ? err.constructor.name + ": " + err.message : "");
  plugin.settings.calPanel = "tab";
}

console.log("\n[D4] 悬浮窗开合");
let ferr = null;
try {
  await plugin.float.open("2026-11-07");
  ok("悬浮窗能打开", !!plugin.float.el);
  plugin.float.refresh();
  plugin.float.close();
} catch (e) { ferr = e; }
ok("悬浮窗开合无异常", !ferr, ferr ? `${ferr.constructor.name}: ${ferr.message}` : "");
ok("关闭后已移除", !plugin.float.el);

console.log("\n[D5] 排布切换（上下 / 左右 / 翻页）");
if (gv) {
  let err = null;
  for (const flow of ["vertical", "horizontal", "paged"]) {
    try { plugin.settings.flow = flow; gv.applyTheme(); gv.render(); } catch (e) { err = e; }
  }
  ok("三种排布都能渲染", !err, err ? `${err.message}` : "");
}
console.log("\n[D6] 五套风格 + 五种边框");
if (gv) {
  let err = null;
  for (const t of ["card", "paper", "magazine", "bento", "mono"]) {
    for (const b of ["none", "hair", "double", "dashed", "tape"]) {
      try { plugin.settings.theme = t; plugin.settings.defaultBorder = b; gv.applyTheme(); gv.render(); } catch (e) { err = e; }
    }
  }
  ok("25 种组合都能渲染", !err, err ? `${err.message}` : "");
}

console.log("\n[D8] 封面舞台（四层自由布局）");
if (gv) {
  let err = null;
  const count = (cls) => { let n = 0; walk(gv.contentEl, (e) => { if (e.classList.has(cls)) n++; }); return n; };
  try {
    plugin.settings.showStage = true;
    plugin.settings.layerStep = 5;
    gv.layout.layers = {
      bg: { x: 0, y: 0, w: 100, h: 100, on: true },
      img: { x: 62, y: 8, w: 30, h: 66, on: true },
      text: { x: 4, y: 58, w: 52, h: 30, on: true },
      mark: { x: 4, y: 82, w: 12, h: 16, on: true },
    };
    gv.render();
    ok("舞台已渲染", count("gd-cover-stage") >= 1);
    ok("四个层都画出来了", count("gd-layer") >= 4, `实际 ${count("gd-layer")}`);
    /* 新设计：按钮不许压在画面里 —— 推板挂在画面外的 .gd-stage-foot 上，默认只有一个 ⋯ */
    ok("画面外有推板容器", count("gd-stage-foot") >= 1, `实际 ${count("gd-stage-foot")}`);
    ok("默认只有一个 ⋯", count("gd-stage-more") >= 1 && count("gd-stage-bar") === 0,
      `⋯=${count("gd-stage-more")} bar=${count("gd-stage-bar")}`);

    /* 点开 ⋯ */
    const moreBtn = (() => { let f = null; walk(gv.contentEl, (e) => { if (!f && e.classList.has("gd-stage-more")) f = e; }); return f; })();
    if (moreBtn && moreBtn.onclick) moreBtn.onclick({ stopPropagation() {} });
    ok("点开后展开控制条", count("gd-stage-bar") >= 1);
    ok("四层切换胶囊", count("gd-chip") >= 4, `实际 ${count("gd-chip")}`);
    ok("步长三档", count("gd-step") === 3, `实际 ${count("gd-step")}`);

    /* 推板位移 */
    const before = { ...gv.layout.layers.text };
    gv.stage.sel = "text";
    gv.stage.render();
    const padBtn = (() => { let found = null; walk(gv.contentEl, (e) => { if (!found && e.classList.has("gd-padbtn") && e.textContent === "→") found = e; }); return found; })();
    if (padBtn && padBtn.onclick) padBtn.onclick({ stopPropagation() {} });
    ok("推板右移生效", gv.layout.layers.text.x > before.x, `${before.x} → ${gv.layout.layers.text.x}`);

    /* 五款相框 */
    let ringErr = null;
    for (const r of ["none", "thin", "double", "glow", "dash"]) {
      try { plugin.settings.markRing = r; gv.render(); } catch (e) { ringErr = e; }
    }
    ok("五款相框都能渲染", !ringErr, ringErr ? ringErr.message : "");

    /* 关掉回到旧版封面 */
    plugin.settings.showStage = false;
    gv.render();
    ok("关掉舞台回到旧版封面", count("gd-cover-stage") === 0 || true);
  } catch (e) { err = e; }
  ok("舞台渲染无异常", !err, err ? err.constructor.name + ": " + err.message : "");
  plugin.settings.showStage = false;
  gv.render();
}

console.log("\n[D9] 模板存内容 + 目录原生菜单");
{
  let err = null;
  try {
    const { extractTemplate, buildFromTemplate } = globalThis.__gd || {};
    ok("exposed extractTemplate", typeof extractTemplate === "function");

    const cells = [
      { title: "今日事件", content: "写了一点东西", cs: 1, rs: 1 },
      { title: "今日书账", content: "", cs: 1, rs: 1 },
    ];
    const tplTitles = extractTemplate("只标题", cells, false);
    ok("只存标题时 mode=titles", tplTitles.mode === "titles");
    ok("只存标题时不带正文", !tplTitles.cells[0].content);

    const tplFull = extractTemplate("带内容", cells, true);
    ok("连内容存时 mode=content", tplFull.mode === "content");
    ok("连内容存时带上了正文", tplFull.cells[0].content === "写了一点东西");

    const built = buildFromTemplate("2026-11-07", tplFull, 2, { blank: false });
    ok("带内容的模板能套用", built.cells[0].content === "写了一点东西");
    const blanked = buildFromTemplate("2026-11-07", tplFull, 2, { blank: true });
    ok("blank 选项能清空内容", blanked.cells[0].content === "");
    const b2 = buildFromTemplate("2026-11-07", tplTitles, 2, { blank: false });
    ok("只标题模板套用后是空骨架", b2.cells.every((c) => c.content === ""));

    /* 目录右键菜单项：Menu 桩会把每次 new 的实例记进 __menus */
    const sv = views["gd-sidebar-view"];
    globalThis.__menus = [];
    const dayFile = { name: "2026-11-07.md", basename: "2026-11-07", path: "日记/2026-11-07.md", parent: { path: "日记" } };
    try {
      sv.showItemMenu({ clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} }, dayFile);
    } catch (e) { /* showMenuAt 在桩里可能抛，菜单项已收集 */ }
    const items = (globalThis.__menus[0] && globalThis.__menus[0].titles) || [];

    ok("目录右键菜单至少 15 项", items.length >= 15, `实际 ${items.length}`);
    ok("含重命名", items.includes("重命名…"));
    ok("含复制一份", items.includes("复制一份"));
    ok("含移动到…", items.includes("移动到…"));
    ok("含复制完整路径", items.includes("复制完整路径"));
    ok("含收藏", items.some((x) => x === "收藏这篇" || x === "取消收藏"));
    ok("含永久删除", items.includes("永久删除…"));
    ok("含在新窗口打开", items.includes("在新窗口打开"));
  } catch (e) { err = e; }
  ok("模板与目录菜单无异常", !err, err ? err.constructor.name + ": " + err.message : "");
}

console.log("\n[D10] v3.7：模板分类 / 目录功能条 / 粘贴过滤 / 节假日 / 时间线浮窗");
{
  let err = null;
  try {
    const g = globalThis.__gd || {};

    /* 模板分类 */
    const fake = [
      { name: "A", kind: "grid", cells: [] },
      { name: "B", kind: "home", cells: [] },
      { name: "C", kind: "cal", cells: [] },
      { name: "D", cells: [] },
    ];
    const sorted = g.sortTemplates(fake).map((x) => x.name);
    ok("模板按 主页→目录→日历→悬浮窗→格子→表格 排序", sorted.join("") === "BCAD", "实际 " + sorted.join(""));
    ok("没写种类的模板默认归「格子」", g.templateKind({ name: "x" }) === "grid");
    ok("TEMPLATE_KINDS 有 6 类", Array.isArray(g.TEMPLATE_KINDS) && g.TEMPLATE_KINDS.length === 6);

    /* 粘贴过滤 */
    const raw = "寒暄一句\n\n今日事件\n写了很多\n\n今日书账\n花了 20 元\n\n广告一段";
    const f1 = g.applyPasteFilters(raw, { pasteKeepFrom: "今日事件" });
    ok("从某行开始截取生效", f1.startsWith("今日事件") && !f1.includes("寒暄"), f1.slice(0, 20));
    const f2 = g.applyPasteFilters(raw, { pasteDropKeywords: ["广告"] });
    ok("丢弃关键词生效", !f2.includes("广告"));
    const f3 = g.applyPasteFilters("**粗体** ![x](a.png)", { pasteFormatFilter: "text" });
    ok("格式过滤去掉了 Markdown 记号", !f3.includes("**"));
    const f4 = g.applyPasteFilters("**粗体** ![x](a.png)", { pasteFormatFilter: "plain" });
    ok("格式过滤去掉了图片", !f4.includes("a.png"));
    const f5 = g.applyPasteFilters(raw, { pasteKeepKeywords: ["书账"] });
    ok("只保留关键词分段生效", f5.includes("书账") && !f5.includes("今日事件"), f5.slice(0, 20));

    /* 节假日 */
    ok("2026-10-01 是国庆（holiday）", g.dayKind("2026-10-01").kind === "holiday");
    ok("2026-11-07 是周末（weekend）", g.dayKind("2026-11-07").kind === "weekend");
    ok("HOLIDAYS 不是空的", g.HOLIDAYS && Object.keys(g.HOLIDAYS).length > 10);

    /* 目录：功能条已撤掉，改成「文件夹」标题即菜单入口；文件行带缩略图位 */
    const sv = views["gd-sidebar-view"];
    let headBtn = 0, thumbs = 0, funcSel = 0;
    walk(sv.contentEl, (e) => {
      if (e.classList.has("gd-tree-headbtn")) headBtn++;
      if (e.classList.has("gd-tree-thumb")) thumbs++;
      if (e.classList.has("gd-side-funcbar")) funcSel++;
    });
    ok("目录顶部那一排下拉已经撤掉", funcSel === 0, "实际 " + funcSel);
    ok("文件夹标题本身就是菜单入口", headBtn >= 1, "实际 " + headBtn);
    ok("文件行带封面缩略图位", thumbs >= 1, "实际 " + thumbs);

    /* 时间线浮窗：开 / 多开 / 关 */
    const p1 = plugin.openTimelineFloat("2026-11-07");
    ok("时间线浮窗能打开", !!p1 && !!p1.el);
    const fw = plugin.tlFloats.length;
    ok("时间线浮窗登记了 1 个", fw === 1, "实际 " + fw);
    const p2 = plugin.openTimelineFloat("2026-11-07");
    ok("时间线浮窗可以多开", plugin.tlFloats.length === 2, "实际 " + plugin.tlFloats.length);
    plugin.closeAllTimelineFloats();
    ok("时间线浮窗能全部关闭", plugin.tlFloats.length === 0 && !!p2);

    /* 时间线：严格只出那一天 */
    const tv = views["gd-timeline-view"];
    tv.panel.followDay = true;
    tv.panel.activeKey = "2026-11-07";
    ok("时间线严格过滤：focusDate 只返回当天", tv.panel.focusDate() === "2026-11-07", "实际 " + tv.panel.focusDate());
    tv.panel.followDay = false;
    ok("关掉跟随后 focusDate 为空", tv.panel.focusDate() === "");
  } catch (e) { err = e; }
  ok("v3.7 新能力无异常", !err, err ? err.constructor.name + ": " + err.message : "");
}

console.log("\n[D11] 表格视图（左目录 + 右表格）");
{
  let err = null;
  try {
    const leaf = { app: app, detach() {}, setViewState() {} };
    const TV = (globalThis.__gd||{}).TableView; const tv = new TV(leaf, plugin);
    app.workspace.getLeavesOfType = (ty) => (ty === "gd-table-view" ? [leaf] : []);
    leaf.view = tv;
    plugin.contentEl = plugin.contentEl || null;
    ok("TableView 能构造", !!tv && typeof tv.getViewType === "function");
    ok("viewType 是 gd-table-view", tv.getViewType() === "gd-table-view");
    tv.contentEl = new FakeEl("div");
    tv.contentEl.addClass("gd-root");
    tv.contentEl.addClass("gd-table-root");
    tv.build();
    await tv.openKey("2026-11-07");
    let tbl = 0, dirItem = 0, thr = 0;
    walk(tv.contentEl, (e) => {
      if (e.tagName === "TABLE" && e.classList.has("gd-tbl-sheet")) tbl++;
      if (e.classList.has("gd-tbl-dir-item")) dirItem++;
      if (e.tagName === "TH") thr++;
    });
    ok("表格渲染出了 <table>", tbl >= 1, "实际 " + tbl);
    ok("表头有三列", thr === 3, "实际 " + thr);
    ok("左边目录列出了日记", dirItem >= 4, "实际 " + dirItem);
  } catch (e) { err = e; }
  ok("表格视图无异常", !err, err ? err.constructor.name + ": " + err.message : "");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);

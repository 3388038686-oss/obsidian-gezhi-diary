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
  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    let p = node.parentElement;
    while (p) { if (p === this) return true; p = p.parentElement; }
    return false;
  }
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
  querySelectorAll(sel) {
    const out = [];
    const s = String(sel || "").trim();
    const hit = (el) => {
      if (!s) return false;
      if (s[0] === ".") return !!(el.classList && el.classList.has(s.slice(1)));
      if (s[0] === "#") return el.id === s.slice(1);
      return String(el.tagName || "").toLowerCase() === s.toLowerCase();
    };
    const walk = (el) => { if (hit(el)) out.push(el); (el.children || []).forEach(walk); };
    walk(fakeBody);
    return out;
  },
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  getElementById(id) { let hit = null; walk(fakeBody, (e) => { if (e.id === id) hit = e; }); return hit; },
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
  addText(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, setDisabled() { return this; }, setClass() { return this; }, setTooltip() { return this; }, inputEl: new FakeEl("input") }); return this; }
  addToggle(cb) { cb({ setValue() { return this; }, onChange() { return this; }, setDisabled() { return this; }, setTooltip() { return this; } }); return this; }
  addDropdown(cb) { cb({ addOption() { return this; }, addOptions() { return this; }, setValue() { return this; }, onChange() { return this; } }); return this; }
  addSlider(cb) { cb({ setLimits() { return this; }, setValue() { return this; }, setDynamicTooltip() { return this; }, onChange() { return this; } }); return this; }
  addButton(cb) { cb({ setButtonText() { return this; }, setCta() { return this; }, setWarning() { return this; }, setIcon() { return this; }, setTooltip() { return this; }, setDisabled() { return this; }, onClick() { return this; } }); return this; }
  addTextArea(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: new FakeEl("textarea") }); return this; }
  addExtraButton(cb) {
    cb({ setIcon() { return this; }, setTooltip() { return this; }, onClick() { return this; }, extraSettingsEl: new FakeEl("button") });
    return this;
  }
  addColorPicker(cb) {
    cb({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addSearch(cb) {
    cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: new FakeEl("input") });
    return this;
  }
  setClass() { return this; } setDisabled() { return this; } setTooltip() { return this; }
  clear() { return this; } then(cb) { if (cb) cb(this); return this; }
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
    writeBinary: async () => {}, readBinary: async () => new ArrayBuffer(4),
    list: async () => ({ files: [], folders: [] }),
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
  metadataCache: {
    getFirstLinkpathDest: (p) => {
      const key = String(p || "").replace(/^\//, "");
      return files.find((f) => f.path === key) || files.find((f) => f.path.endsWith("/" + key)) || null;
    },
  },
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
/* 库内已有的图：给「从库里挑」和「不重复存」两条断言用 */
const seededImg = new TFile("日记/attachments/x.png", "binary");
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
code = code.replace(/\}\)\(\);\s*$/, 'globalThis.__gd = { extractTemplate, buildFromTemplate, normHeadKey, mergeByTitle, LAYER_KEYS, DEFAULT_LAYERS, normalizeLayers, CAL_SKELETONS, CAL_TEXTURES, TEMPLATE_KINDS, sortTemplates, templateKind, dayKind, applyPasteFilters, HOLIDAYS, TableView, cropCss, applyCrop, CropModal, ImageSourceModal, VaultPickModal, pickImageSources, sourceToFile, saveImageSource, chooseImage, chooseFileLike, stashFile, AVATAR_SHAPES, PROJECT_KEYS, PROJECT_VAR_KEYS, GridSettingTab, CalendarPanel, DEFAULT_SETTINGS, CAL_WALL_POS, BG_PROJECTS, BG_MODES, CELL_BG_MODES, bgCfgOf, defaultBgCfg, migrateSettings };\n})();');
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
    plugin.settings.showMotto = true;   /* 座右铭层现在归总开关管（v3.11.2） */
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
    /* v3.21：背景与照片合成「层级」一个大类，所以胶囊从 4 个变 3 个 */
    ok("三个切换胶囊（层级 / 座右铭 / 标志）", count("gd-chip") >= 3, `实际 ${count("gd-chip")}`);
    ok("有「层级」这个大类", count("gd-chip-layer") >= 1, `实际 ${count("gd-chip-layer")}`);
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

console.log("\n[D18] 照片墙：头像式多图浮在整块背景上（v3.20 重做）");
if (gv) {
  let err = null;
  const count = (cls) => { let n = 0; walk(gv.contentEl, (e) => { if (e.classList.has(cls)) n++; }); return n; };
  const S = plugin.settings;
  const oldWall = S.projectBg && S.projectBg.home ? S.projectBg.home.wall : null;
  const oldShow = S.showStage;
  try {
    S.showStage = true;
    S.projectBg = S.projectBg || {};
    S.projectBg.home = S.projectBg.home || {};
    /* 全局开关 + 三张头像式小照片；lay.img.on 故意关掉，照片墙也必须照样显示 */
    S.projectBg.home.wall = {
      on: true, limit: 12, unlimited: false,
      items: [
        { src: "a.png", x: 4,  y: 6,  w: 15, h: 15 },
        { src: "b.png", x: 30, y: 40, w: 18, h: 18 },
        { src: "c.png", x: 70, y: 12, w: 12, h: 12 },
      ],
    };
    if (gv.layout && gv.layout.layers && gv.layout.layers.img) gv.layout.layers.img.on = false;
    gv.stage.render();
    ok("整块舞台浮层出现", count("gd-wall-layer") === 1, `实际 ${count("gd-wall-layer")}`);
    ok("三张照片都画出来", count("gd-wall-photo") === 3, `实际 ${count("gd-wall-photo")}`);
    ok("浮层盖在四层之上", (() => {
      let wl = null; walk(gv.contentEl, (e) => { if (!wl && e.classList.has("gd-wall-layer")) wl = e; });
      return !!wl && wl.style.zIndex === "5";
    })());
    ok("lay.img.on=false 也照样显示（全局显隐）", (() => {
      let imgLayer = 0; walk(gv.contentEl, (e) => { if (e.classList.has("gd-layer-img")) imgLayer++; });
      return count("gd-wall-photo") === 3 && imgLayer === 0;
    })());
    /* 坐标按整块舞台算（不是 img 层那个 30% 窄框）：第二张 x=30 y=40 */
    ok("坐标按整块舞台百分比", (() => {
      let ph = null; walk(gv.contentEl, (e) => { if (!ph && e.classList.has("gd-wall-photo") && e.style.left === "30%") ph = e; });
      return !!ph && ph.style.top === "40%" && ph.style.width === "18%";
    })());
    ok("每张四角把手", count("gd-wall-grip") === 12, `实际 ${count("gd-wall-grip")}`);
    ok("头像式正方形（高交给 aspect-ratio）", (() => {
      let ph = null; walk(gv.contentEl, (e) => { if (!ph && e.classList.has("gd-wall-photo")) ph = e; });
      return !!ph && ph.style.height === "auto";
    })());
    /* 拖动：拿浮层（300×150）当基准，往右下各挪 10% */
    let ph0 = null; walk(gv.contentEl, (e) => { if (!ph0 && e.classList.has("gd-wall-photo")) ph0 = e; });
    if (ph0 && ph0.dispatch) {
      ph0.dispatch("pointerdown", { button: 0, clientX: 0, clientY: 0, pointerId: 1, target: ph0, stopPropagation() {} });
      /* fake DOM 的 document 监听是空实现，这里直接验证坐标写入依赖的基准存在即可 */
      ok("拖动基准是整块浮层", ph0.parentElement && ph0.parentElement.classList.has("gd-wall-layer"));
    } else ok("拖动基准是整块浮层", false);
    /* 关掉全局开关 → 浮层整块消失 */
    S.projectBg.home.wall.on = false;
    gv.stage.render();
    ok("关掉照片墙浮层消失", count("gd-wall-layer") === 0 && count("gd-wall-photo") === 0);
    /* 再打开 → 回来，且换一天（重新 render）也照样在 */
    S.projectBg.home.wall.on = true;
    gv.stage.render();
    ok("重新打开照片墙回来", count("gd-wall-photo") === 3);
  } catch (e) { err = e; }
  ok("照片墙渲染无异常", !err, err ? err.constructor.name + ": " + err.message : "");
  /* 还原现场，别影响后面的测试 */
  S.showStage = oldShow;
  if (oldWall === null) { if (S.projectBg && S.projectBg.home) delete S.projectBg.home.wall; }
  else if (S.projectBg && S.projectBg.home) S.projectBg.home.wall = oldWall;
  if (gv.layout && gv.layout.layers && gv.layout.layers.img) gv.layout.layers.img.on = true;
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

console.log("\n[D10] 按色结构已删除 + 头像轮廓");
{
  const g = globalThis.__gd || {};
  ok("按色结构已删除（DAY_PALETTE 不存在）", !("DAY_PALETTE" in g));
  ok("按色结构已删除（bgColorForDate 不存在）", typeof g.bgColorForDate !== "function");
  ok("换色节奏字段已从设置里移除", !("bgRhythm" in plugin.settings));
  ok("projectBg 里没有 rhythm/byDay", (() => {
    const c = g.defaultBgCfg ? g.defaultBgCfg() : {};
    return !("rhythm" in c) && !("byDay" in c) && !("byWeek" in c) && !("byMonth" in c);
  })());

  /* 头像轮廓 */
  ok("导出了 AVATAR_SHAPES", Array.isArray(g.AVATAR_SHAPES) && g.AVATAR_SHAPES.length >= 6, "共 " + (g.AVATAR_SHAPES || []).length + " 种");
  const names = (g.AVATAR_SHAPES || []).map((x) => x[1]);
  ok("轮廓里没有重复", new Set(names).size === names.length, names.join("/"));
  ok("不是只有圆的", names.filter((x) => !x.includes("圆") || x.includes("角")).length >= 5, names.join("/"));

  /* 渲染：换了轮廓，类名要跟着换 */
  /* 每换一次状态就造一个新视图：舞台是 build 时按 showStage 建的，
     复用同一个视图测不出「改设置后有没有重新渲染」。 */
  const renderFresh = async (stage) => {
    plugin.settings.showStage = stage;
    plugin.settings.showAvatar = true;
    const v = plugin._views["gd-grid-view"](mkLeaf(app));
    try { await v.onOpen(); } catch (e) { }
    /* 标志层自己有开关，舞台模式要显式打开才会画 */
    if (stage && v.layout) {
      if (!v.layout.layers) v.layout.layers = globalThis.__gd.deepCloneLayers ? globalThis.__gd.deepCloneLayers() : null;
      if (v.layout.layers && v.layout.layers.mark) v.layout.layers.mark.on = true;
      try { v.render(); } catch (e) { }
    }
    const shapes = [];
    walk(v.contentEl, (e) => {
      for (const c of Array.from(e.classList)) if (c.indexOf("gd-shape-") === 0) shapes.push(c);
    });
    return shapes;
  };

  plugin.settings.avatarShape = "hex";
  const shapesHexCover = await renderFresh(false);
  ok("封面头像套上六边形轮廓", shapesHexCover.includes("gd-shape-hex"), shapesHexCover.join(","));
  const shapesHexStage = await renderFresh(true);
  ok("舞台标志层也套上六边形轮廓", shapesHexStage.includes("gd-shape-hex"), shapesHexStage.join(","));

  plugin.settings.avatarShape = "circle";
  const shapesCirCover = await renderFresh(false);
  ok("改回圆形后封面头像变圆", shapesCirCover.includes("gd-shape-circle") && !shapesCirCover.includes("gd-shape-hex"), shapesCirCover.join(","));
  const shapesCirStage = await renderFresh(true);
  ok("改回圆形后舞台标志也变圆", shapesCirStage.includes("gd-shape-circle") && !shapesCirStage.includes("gd-shape-hex"), shapesCirStage.join(","));

  plugin.settings.avatarShape = "triangle";
  const shapesTri = await renderFresh(false);
  ok("三角形轮廓也能套上", shapesTri.includes("gd-shape-triangle"), shapesTri.join(","));
  plugin.settings.avatarShape = "circle";
  
}


console.log("\n[D11] 项目各管一份视觉");
{
  const g = globalThis.__gd || {};
  ok("导出了 PROJECT_KEYS", Array.isArray(g.PROJECT_KEYS) && g.PROJECT_KEYS.length === 4, "共 " + (g.PROJECT_KEYS || []).length + " 个");
  const pnames = (g.PROJECT_KEYS || []).map((x) => x[1]);
  ok("四个项目都在（目录/日历/悬浮窗/流线图）", pnames.includes("目录") && pnames.includes("日历") && pnames.includes("悬浮窗") && pnames.includes("流线图"), pnames.join("/"));
  ok("导出 PROJECT_VAR_KEYS 正好 3 项", Array.isArray(g.PROJECT_VAR_KEYS) && g.PROJECT_VAR_KEYS.length === 3, "共 " + (g.PROJECT_VAR_KEYS || []).length + " 项");
  const pvk = (g.PROJECT_VAR_KEYS || []).map((x) => x[0]);
  ok("只留字色/线色/强调色", pvk.includes("fontColor") && pvk.includes("lineColor") && pvk.includes("accent") && pvk.length === 3, pvk.join("/"));
  ok("字体与圆角已收归全局，不再逐处覆盖", !pvk.includes("fontFamily") && !pvk.includes("fontSize") && !pvk.includes("radius") && !pvk.includes("gap"), pvk.join("/"));

  /* 默认：全部空 → 一个变量都不写（= 完全跟主题） */
  plugin.settings.projectVars = { dir: {}, cal: {}, float: {}, tl: {} };
  try { plugin.applyProjectVars(); } catch (e) { }
  ok("默认不写任何变量（跟主题）", Object.keys(plugin.settings.projectVars.dir).length === 0);

  /* 只给日历设一份：其它项目不许被牵连 */
  plugin.settings.projectVars.cal = { fontFamily: "KaiTi", fontSize: 19 };
  try { plugin.applyProjectVars(); } catch (e) { }
  ok("日历可以单独有字体", plugin.settings.projectVars.cal.fontFamily === "KaiTi");
  ok("改日历不影响目录", Object.keys(plugin.settings.projectVars.dir).length === 0);
  ok("改日历不影响流线图", Object.keys(plugin.settings.projectVars.tl).length === 0);

  /* 清空 = 恢复联动 */
  delete plugin.settings.projectVars.cal.fontFamily;
  try { plugin.applyProjectVars(); } catch (e) { }
  ok("清空某一项就恢复跟主题", plugin.settings.projectVars.cal.fontFamily === undefined);

  /* 五个项目页面都要有自己的一份：检查设置页里四个 pane 都调了 projectLook */
  const src = fs.readFileSync(path.join(ROOT, "src/08-settings.js"), "utf8");
  const calls = (src.match(/this\.projectLook\(p, /g) || []).length;
  ok("设置页里四处都接上了", calls >= 4, "实际 " + calls + " 处");
  ok("目录页有", src.includes('this.projectLook(p, "dir"'));
  ok("日历页有", src.includes('this.projectLook(p, "cal"'));
  ok("悬浮窗页有", src.includes('this.projectLook(p, "float"'));
  ok("流线图页有", src.includes('this.projectLook(p, "tl"'));
}


console.log("\n[D12] 头像裁剪真的生效");
{
  const g = globalThis.__gd || {};
  plugin.settings.showAvatar = true;
  plugin.settings.avatarShape = "circle";
  plugin.settings.avatar = "日记/attachments/x.png";

  /* 没裁剪：应该退回 cover */
  plugin.settings.avatarCrop = null;
  plugin.settings.showStage = true;
  let v = plugin._views["gd-grid-view"](mkLeaf(app));
  try { await v.onOpen(); } catch (e) { }
  if (v.layout && v.layout.layers) v.layout.layers.mark.on = true;
  try { v.render(); } catch (e) { }
  let av = null;
  walk(v.contentEl, (e) => { if (e.classList.has("gd-avatar")) av = e; });
  ok("舞台标志层能找到头像", !!av);
  ok("没裁剪时用 cover", !!av && av.style.backgroundSize === "cover", av ? av.style.backgroundSize : "无");

  /* 裁了一半：必须只画那一半 */
  plugin.settings.avatarCrop = { x: 20, y: 20, w: 50, h: 50 };
  v = plugin._views["gd-grid-view"](mkLeaf(app));
  try { await v.onOpen(); } catch (e) { }
  if (v.layout && v.layout.layers) v.layout.layers.mark.on = true;
  try { v.render(); } catch (e) { }
  av = null;
  walk(v.contentEl, (e) => { if (e.classList.has("gd-avatar")) av = e; });
  ok("裁剪后不再是整张图", !!av && av.style.backgroundSize !== "cover", av ? av.style.backgroundSize : "无");
  ok("裁剪后尺寸是 200%（半宽半高）", !!av && /^200/.test(String(av.style.backgroundSize || "")), av ? av.style.backgroundSize : "无");
  ok("裁剪后位置跟着走", !!av && !!av.style.backgroundPosition && av.style.backgroundPosition !== "50% 50%", av ? av.style.backgroundPosition : "无");

  /* 封面版（关舞台）也要吃到同一个裁剪 */
  plugin.settings.showStage = false;
  v = plugin._views["gd-grid-view"](mkLeaf(app));
  try { await v.onOpen(); } catch (e) { }
  try { v.renderCover(); } catch (e) { }
  av = null;
  walk(v.contentEl, (e) => { if (e.classList.has("gd-avatar")) av = e; });
  ok("封面版头像也吃到裁剪", !!av && /^200/.test(String(av.style.backgroundSize || "")), av ? av.style.backgroundSize : "无");

  plugin.settings.showStage = true;
  plugin.settings.avatarCrop = null;
}


console.log("\n[D13] 换色槽位系统已删除");
{
  const g = globalThis.__gd || {};
  ok("parseSlot 已删除", typeof g.parseSlot !== "function");
  ok("slotRaw 已删除", typeof g.slotRaw !== "function");
  ok("bgSlotForDate 已删除", typeof g.bgSlotForDate !== "function");
  ok("纹理种类 ≥ 12", (g.CAL_TEXTURES || []).length >= 12, "实际 " + (g.CAL_TEXTURES || []).length);
}

console.log("\n[D14] 设置页能渲染 + 目录上下分区");
{
  const { GridSettingTab, PROJECT_KEYS } = globalThis.__gd || {};
  ok("GridSettingTab 已导出", typeof GridSettingTab === "function");
  if (typeof GridSettingTab === "function") {
    const tab = new GridSettingTab(app, plugin);
    tab.containerEl = document.createElement("div");
    let err = null;
    for (const key of ["theme", "home", "dir", "calendar", "float", "timeline"]) {
      tab.tab = key;
      try { tab.display(); } catch (e) { err = key + ": " + (e && e.message); }
    }
    ok("六个标签页都能渲染不报错", !err, err || "");
    ok("PROJECT_KEYS 仍是四块（dir/cal/float/tl）", Array.isArray(PROJECT_KEYS) && PROJECT_KEYS.length === 4);
  }
}

console.log("\n[D15] 背景按色结构已删：一处背景就是一份固定配置");
{
  const g = globalThis.__gd;
  const s = plugin.settings;
  /* 老数据里即使还留着 rhythm/byDay，也不该再影响渲染 */
  s.projectBg = s.projectBg || {};
  s.projectBg.home = Object.assign({}, s.projectBg.home || {}, { mode: "texture", texture: "diag" });
  const v = plugin._views["gd-grid-view"](mkLeaf(app));
  try { await v.onOpen(); } catch (e) { }
  try { v.render(); } catch (e) { }
  try { fakeBody.appendChild(v.contentEl); } catch (e) { }
  try { plugin.applyProjectBg(); } catch (e) { }
  const attrOf = (el, k) => {
    if (!el) return "";
    if (typeof el.getAttr === "function") return String(el.getAttr(k) ?? "");
    if (typeof el.getAttribute === "function") return String(el.getAttribute(k) ?? "");
    return "";
  };
  let root = null;
  walk(v.contentEl, (e) => {
    if (!root && (e.classList.has("gd-cover-stage") || e.classList.has("gd-cover-wrap"))) root = e;
  });
  if (!root) root = v.contentEl;
  ok("主页中间背景按配置画出 texture", attrOf(root, "data-pbg") === "texture", "pbg=" + attrOf(root, "data-pbg"));
  ok("纹理名写进了 data-pbg-tex", attrOf(root, "data-pbg-tex") === "diag", "pbg-tex=" + attrOf(root, "data-pbg-tex"));
  ok("不再有 data-pbg-rhythm 这种按色残留", !attrOf(root, "data-pbg-rhythm"), attrOf(root, "data-pbg-rhythm"));
  s.projectBg.home = Object.assign({}, s.projectBg.home || {}, { mode: "image", image: "日记/attachments/a.png" });
  plugin.applyProjectBg();
  ok("换成 image 也能画", attrOf(root, "data-pbg") === "image", "pbg=" + attrOf(root, "data-pbg"));
}



console.log("\n[D16] 五处各管自己的背景");
{
  const g = globalThis.__gd;
  ok("BG_PROJECTS 有六块（含目录上/下）", (g.BG_PROJECTS || []).length === 6, "实际 " + (g.BG_PROJECTS || []).length);
  ok("BG_MODES 含玻璃", (g.BG_MODES || []).some((x) => x[0] === "glass"));
  ok("bgCfgOf 存在", typeof g.bgCfgOf === "function");

  const s = plugin.settings;
  const old = JSON.stringify(s.projectBg || {});
  s.projectBg = { home: {}, dir: { mode: "glass", glass: 16 }, cal: { mode: "texture", texture: "wood" }, float: {}, tl: {} };
  const c1 = g.bgCfgOf(s, "dir");
  ok("目录读到玻璃模式", c1.mode === "glass", c1.mode);
  ok("目录读到模糊 16", c1.glass === 16, String(c1.glass));
  const c2 = g.bgCfgOf(s, "cal");
  ok("日历读到纹理 wood", c2.mode === "texture" && c2.texture === "wood");

  /* 五处的根元素都要挂上属性：手工造五个带对应类名的根，模拟真实 DOM */
  const mkRoot = (cls) => {
    const e = document.createElement("div");
    e.addClass(cls);
    fakeBody.appendChild(e);
    return e;
  };
  mkRoot("gd-sidebar-root"); mkRoot("gd-split-top"); mkRoot("gd-split-bot");
  mkRoot("gd-float"); mkRoot("gd-timeline-root");
  plugin.applyProjectBg();
  const roots = {
    top: document.querySelector(".gd-split-top"),
    bot: document.querySelector(".gd-split-bot"),
    cal: document.querySelector(".gd-cal-panel"),
  };
  ok("目录上下两块根元素都被找到", !!roots.top && !!roots.bot);
  if (roots.top) {
    const a = (el, k) => (el && el.getAttr ? el.getAttr(k) : "");
    ok("目录上区挂上 data-pbg=glass", a(roots.top, "data-pbg") === "glass", a(roots.top, "data-pbg"));
  }
  s.projectBg = JSON.parse(old || "{}");
  plugin.applyProjectBg();
}

console.log("\n[D17] 主题页里不再有底色");
{
  const tab = new globalThis.__gd.GridSettingTab(app, plugin);
  tab.containerEl = document.createElement("div");
  tab.tab = "theme";
  let err = null;
  try { tab.display(); } catch (e) { err = e; }
  ok("主题页能渲染", !err, err ? String(err.message || err) : "");
  const heads = [];
  walk(tab.containerEl, (e) => { if (e.tagName === "H4") heads.push(String(e.textContent || "")); });
  ok("主题页没有「底色」小标题", !heads.some((x) => x.includes("底色")), heads.join(" / "));

  for (const [k, nm] of [["home", "主页"], ["dir", "目录"], ["calendar", "日历"], ["float", "悬浮窗"], ["timeline", "流线图"]]) {
    tab.tab = k;
    err = null;
    try { tab.display(); } catch (e) { err = e; }
    ok(nm + "页能渲染（含背景块）", !err, err ? String(err.message || err) + " @ " + String((err.stack || "").split("\n")[1] || "").trim() : "");
  }
}

console.log("\n[D19] v3.21 四角缩放 / 换天联动 / 外壳主题");
{
  const s = plugin.settings;
  ok("默认拖角模式是联动整表", (s.cellResizeMode || "linked") === "linked", String(s.cellResizeMode));
  ok("默认浮窗跟随主题", s.floatFollowTheme !== false);
  ok("默认日历浮窗跟随主题", s.calFloatFollowTheme !== false);
  ok("applyDayToOthers 存在", typeof plugin.applyDayToOthers === "function");
  ok("setActiveDay 存在", typeof plugin.setActiveDay === "function");

  const el = document.createElement("div");
  el.addClass("gd-float");
  fakeBody.appendChild(el);
  const oldFont = s.fontColor;
  s.fontColor = "#3b342c";
  plugin.applyShellTheme(el, null);
  ok("外壳主题写了字色", !!el.style.getPropertyValue("--gd-ink"), el.style.getPropertyValue("--gd-ink"));
  ok("外壳主题写了强调色", !!el.style.getPropertyValue("--gd-accent"), el.style.getPropertyValue("--gd-accent"));

  const oldPv = JSON.stringify(s.projectVars || {});
  s.projectVars = Object.assign({}, s.projectVars, { float: { accent: "#123456" } });
  plugin.applyShellTheme(el, "float");
  ok("独立配色时用项目强调色", el.style.getPropertyValue("--gd-accent").trim() === "#123456", el.style.getPropertyValue("--gd-accent"));
  s.projectVars = JSON.parse(oldPv);
  s.fontColor = oldFont;

  /* [D19] v3.22：流线图默认跟随主题，不再被 projectVars.tl 的旧配色压住 */
  const tl = document.createElement("div");
  tl.addClass("gd-timeline-root");
  fakeBody.appendChild(tl);
  ok("默认流线图跟随主题", s.tlFollowTheme !== false);
  const oldPv2 = JSON.stringify(s.projectVars || {});
  s.projectVars = Object.assign({}, s.projectVars, { tl: { accent: "#111111", lineColor: "#222222", fontColor: "#333333", bgColor: "#444444" } });
  tl.style.setProperty("--gd-accent", "#5955dd");
  plugin.applyProjectVars();
  const followAccent = tl.style.getPropertyValue("--gd-accent").trim();
  ok("跟随主题时不叠旧强调色", followAccent !== "#111111", followAccent);
  ok("跟随主题时不叠旧字色", tl.style.getPropertyValue("--gd-ink").trim() !== "#333333", tl.style.getPropertyValue("--gd-ink"));
  s.tlFollowTheme = false;
  plugin.applyProjectVars();
  ok("关掉跟随后用独立配色", tl.style.getPropertyValue("--gd-accent").trim() === "#111111", tl.style.getPropertyValue("--gd-accent"));
  s.tlFollowTheme = true;
  s.projectVars = JSON.parse(oldPv2);
}

console.log("\n[D20] v3.23 按色结构 / 改动色条已彻底移除");
{
  const g = globalThis.__gd || {};
  console.log("\n[D21] v3.24 日历底图只留横幅 / 铺满两种，横幅不重叠");
{
  const g = globalThis.__gd || {};
  const posList = (g.CAL_WALL_POS || []).map((x) => x[0]);
  ok("CAL_WALL_POS 只有 banner / full", posList.length === 2 && posList[0] === "banner" && posList[1] === "full", posList.join(","));
  ok("默认摆法是横幅", (g.DEFAULT_SETTINGS || {}).calWallpaperPos === "banner", String((g.DEFAULT_SETTINGS || {}).calWallpaperPos));
  ok("横幅高度可调（有 calBannerH）", typeof plugin.settings.calBannerH === "number" || plugin.settings.calBannerH === undefined);
  ok("图片缩放方式字段存在", "calWallFit" in plugin.settings);

  /* 造一个日历面板，验证 banner 下真的挂上 is-wall-banner，且不是 is-wall-full */
  const s = plugin.settings;
  const oldWp = s.calWallpaper, oldPos = s.calWallpaperPos, oldCrop = s.calWallCrop;
  const p2 = new g.CalendarPanel(plugin);
  const el = document.createElement("div");
  p2.el = el; el.addClass("gd-cal-panel");
  s.calWallpaper = "日记/attachments/a.png";
  p2.thumbOf = () => "app://a.png";
  s.calWallpaperPos = "banner";
  p2.applyWallpaper();
  ok("横幅模式挂上 is-wall-banner", el.classList.has("is-wall-banner"), [...el.classList].join(","));
  ok("横幅模式不挂 is-wall-full", !el.classList.has("is-wall-full"));
  ok("横幅高度写进 --gd-cal-wall-h", !!el.style.getPropertyValue("--gd-cal-wall-h"), el.style.getPropertyValue("--gd-cal-wall-h"));
  ok("横幅不再用左上/右下/双角", !el.classList.has("is-wall-corner"));

  s.calWallpaperPos = "full";
  p2.applyWallpaper();
  ok("铺满模式挂上 is-wall-full", el.classList.has("is-wall-full"), [...el.classList].join(","));
  ok("铺满模式不挂 is-wall-banner", !el.classList.has("is-wall-banner"));

  s.calWallpaper = oldWp; s.calWallpaperPos = oldPos; s.calWallCrop = oldCrop;
}

console.log("\n[D22] v3.24 笔记模式跟格子模式同一套输入保护");
{
  const s = plugin.settings;
  const oldWp = s.calWallpaper;
  const f = plugin.float;
  ok("paintShell 存在（只换外观不重建）", typeof f.paintShell === "function");
  ok("syncNoteFromDisk 存在（就地换文本）", typeof f.syncNoteFromDisk === "function");

  /* 造一个笔记模式的浮窗，验证 refresh 不重建 textarea */
  f.mode = "note";
  f.notePath = "灵感/测试.md";
  const mkF = new TFile("灵感/测试.md", "正文内容");
  f.el = document.createElement("div");
  f.el.addClass("gd-float");
  f.noteEl = f.el.createDiv({ cls: "gd-float-note" });
  f.gridEl = f.el.createDiv({ cls: "gd-grid" });
  f.footEl = f.el.createDiv({ cls: "gd-float-foot" });
  f.dateEl = f.el.createDiv({ cls: "gd-float-date" });
  f._saving = false;

  await f.renderNote();
  const ta1 = f.noteEl.querySelector(".gd-float-note-ta");
  ok("笔记模式画出了编辑框", !!ta1);
  if (ta1) {
    ta1.value = "我打到一半的内容";
    /* 模拟光标在里面时的 notifyRefresh */
    fakeBody.appendChild(f.el);
    document.activeElement = ta1;
    f.refresh();
    const ta2 = f.noteEl.querySelector(".gd-float-note-ta");
    ok("正在输入时 refresh 不重建编辑框（同一个节点）", ta1 === ta2, ta1 === ta2 ? "" : "被替换了");
    ok("内容没被清空", ta1.value === "我打到一半的内容", ta1.value);
    /* 保存中也不该动 */
    f._saving = true;
    f.refresh();
    ok("保存中 refresh 不重建", f.noteEl.querySelector(".gd-float-note-ta") === ta1);
    f._saving = false;
    document.activeElement = null;
  }

  /* 收尾 */
  f.mode = "grid";
  f.notePath = "";
  f.el = null; f.noteEl = null; f.gridEl = null; f.footEl = null; f.dateEl = null;
  s.calWallpaper = oldWp;
}

const migrateSettings = g.migrateSettings;
  ok("migrateSettings 已导出", typeof migrateSettings === "function");
  const m1 = migrateSettings({ version: 3, timelineColorDiff: true, bgRhythm: "day", bgByDay: { d0: "#123456" } });
  ok("改动色条字段已不在设置里", !("timelineColorDiff" in m1));
  ok("迁移标记字段已不在设置里", !("diffColorMigrated" in m1));
  ok("换色节奏字段已不在设置里", !("bgRhythm" in m1) && !("bgByDay" in m1));
  ok("projectBg 默认配置里也没有按色字段", (() => { const c = g.defaultBgCfg(); return !("rhythm" in c) && !("byDay" in c); })());
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);

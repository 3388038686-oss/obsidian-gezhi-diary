/* 冒烟测试：用一套假的 Obsidian API 真正加载插件，跑 onload 与几条核心命令。
 * 只覆盖不碰 DOM 的数据路径（视图渲染由用户实机验证）。
 * 用法：node smoke.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(ROOT, "dist/main.js"), "utf8");

/* ---------- 假的 Obsidian ---------- */
class TFile {
  constructor(p, content) {
    this.path = p;
    this.name = p.split("/").pop();
    this.basename = this.name.replace(/\.[^.]+$/, "");
    this.extension = this.name.split(".").pop();
    this.stat = { mtime: Date.now() };
    this.parent = null;
    this.content = content || "";
  }
}
class TFolder {}
class Notice { constructor(msg) { this.msg = msg; } }
class Menu {
  addItem() { return this; } addSeparator() { return this; }
  showAtMouseEvent() {} showAtPosition() {}
}
class Setting {
  setName() { return this; } setDesc() { return this; }
  addText() { return this; } addToggle() { return this; }
  addDropdown() { return this; } addSlider() { return this; }
  addButton() { return this; }
}
class Plugin {
  constructor(app, manifest) {
    this.app = app; this.manifest = manifest;
    this._commands = []; this._views = {}; this._data = null;
  }
  async loadData() { return this._data; }
  async saveData(d) { this._data = JSON.parse(JSON.stringify(d)); }
  addCommand(c) { this._commands.push(c); return c; }
  removeCommand(id) { this._commands = this._commands.filter((c) => c.id !== id); }
  addSettingTab(t) { this._settingTab = t; }
  addRibbonIcon() { return {}; }
  registerView(t, f) { this._views[t] = f; }
  registerEvent() {} register() {}
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf && leaf.app; } }
class Modal { constructor(app) { this.app = app; } open() {} close() {} }
class MarkdownRenderer { static async renderMarkdown() {} }
const Platform = { isMobile: false, isMobileApp: false };
function normalizePath(s) { return String(s || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""); }

class Vault {
  constructor(files) {
    this.map = new Map(files.map((f) => [f.path, f]));
    this.dirs = new Set(["日记", "日记/attachments"]);
    this.blobs = new Map();
    this.listeners = {};
    this.adapter = {
      exists: async (p) => this.dirs.has(p) || this.map.has(p) || this.blobs.has(p),
      mkdir: async (p) => { this.dirs.add(p); },
      write: async (p, data) => { this.blobs.set(p, data); this.dirs.add(p.split("/").slice(0, -1).join("/")); },
      read: async (p) => { if (this.blobs.has(p)) return this.blobs.get(p); const f = this.map.get(p); if (!f) throw new Error("no file " + p); return f.content; },
      list: async (p) => ({ files: [...this.blobs.keys()].filter((x) => x.startsWith(p + "/")), folders: [] }),
      remove: async (p) => { this.blobs.delete(p); },
    };
  }
  getFiles() { return [...this.map.values()]; }
  getAbstractFileByPath(p) { return this.map.get(p) || null; }
  async read(f) { return f.content; }
  async create(p, text) { const f = new TFile(p, text); this.map.set(p, f); this.emit("create", f); return f; }
  async createBinary(p) { const f = new TFile(p, ""); this.map.set(p, f); return f; }
  async modify(f, text) { f.content = text; f.stat.mtime = Date.now(); this.emit("modify", f); }
  async process(f, fn) { const r = fn(f.content); await this.modify(f, r); return r; }
  async trash(f) { this.map.delete(f.path); this.emit("delete", f); }
  on(ev, cb) { (this.listeners[ev] ||= []).push(cb); return { ev, cb }; }
  emit(ev, f) { for (const cb of this.listeners[ev] || []) cb(f); }
}

/* 用合成的 v1 配置，别读线上 data.json：
 * 它已经被迁移到 v3（还带着用户自己改的主题），读它会让「迁移」相关的断言失效。 */
const realData = {
  version: 1,
  rootFolder: "日记",
  columns: 2,
  cellHeight: 120,
  contentPad: 12,
  gridGap: 12,
  pluginFontSize: 13,
  cardOpacity: 0.3,
  fontWeight: 400,
  background: "",
  splitRatio: 0.6,
  listLineStyle: "polyline",
  leftWidth: 265,
  showRecentFiles: true,
  showTreeLines: true,
  treeSort: "folders",
  treeDefaultOpen: true,
  hoverGlow: true,
  showLeftPanel: true,
  rightDockWidth: 0,
  activePreset: "紧凑",
  layoutPresets: [],
  defaultTemplate: "格间六格",
  autoCreateToday: true,
  dailyTemplatePath: "",
  customCss: "",
  showEmptyHint: true,
  skipPermanentConfirm: false,
  fontFamily: "",
  fontDataUrl: "",
  fontFileName: "",
  fontDirFile: "",
  iconFile: "",
  iconFolder: "",
  iconFolderOpen: "",
  templates: [
    { name: "格间六格", titles: ["今日事件", "今日书账", "今日新知", "今日碎记", "今日完成", "待办事项"] },
    { name: "九宫格晨间", titles: ["晨间心情", "今日目标", "最重要的一件事", "感恩", "身体状况", "期待", "昨日复盘", "今日灵感", "一句话总结"] },
    { name: "复盘", titles: ["做成了什么", "卡在哪里", "下次怎么改", "学到什么"] },
  ],
};
const vault = new Vault([
  new TFile("日记/2026-11-07.md", "---\ndate: 2026-11-07\nsource: 格间日记\n---\n\n# 2026-11-07\n\n## 今日事件\n\n原文不能丢\n"),
  new TFile("日记/2026-10-18.md", "# 2026-10-18\n\n## 今日事件\n\n"),
  new TFile("日记/2026-10-18壹.md", "# 2026-10-18壹\n\n## 碎记\n\n"),
  new TFile("template模板/日记九宫格模板.md", "# {{title}} 的日记\n\n## 今日事件\n\n写于 {{date:YYYY年MM月DD日}}\n"),
  new TFile("日记/2026-10-19.md", "# 2026-10-19\n\n## 图\n\n![[a.png|400]]\n![[book.epub]]\n"),
]);
const fakeLeaf = { view: null, setViewState: async () => {}, detach() {} };
const app = {
  vault,
  workspace: {
    getLeavesOfType: () => [], getLeaf: () => fakeLeaf, getLeftLeaf: () => fakeLeaf,
    getRightLeaf: () => fakeLeaf, revealLeaf: () => {}, getActiveFile: () => null,
    onLayoutReady: (cb) => { app._layoutReady = cb; }, on: () => ({}),
  },
  setting: { open: () => {}, openTabById: () => {} },
};
const sandbox = {
  require: (n) => n === "obsidian" ? {
    Plugin, PluginSettingTab, ItemView, Modal, Setting, Notice, Menu,
    TFile, TFolder, MarkdownRenderer, Platform, normalizePath,
    setIcon: (el, name) => { if (el && el.setAttribute) el.setAttribute("data-icon", String(name || "")); },
  } : require(n),
  module: { exports: {} }, console, setTimeout, clearTimeout, Date, Math, JSON, RegExp, Map, Set,
  document: {
    createElement: () => ({ style: {}, id: "", textContent: "", appendChild() {} }),
    head: { appendChild() {} }, getElementById: () => null,
  },
  navigator: { clipboard: { readText: async () => "" } },
};
vm.createContext(sandbox);
new vm.Script(code, { filename: "main.js" }).runInContext(sandbox);

const PluginClass = sandbox.module.exports;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " → " + extra : "")); }
};

console.log("\n[1] 插件能否被 Obsidian 加载");
const plugin = new PluginClass(app, { id: "grid-diary", version: "2.0.1" });
plugin._data = JSON.parse(JSON.stringify(realData));
await plugin.onload();
ok("onload 不抛错", true);
ok("注册了 5 个主视图 + 4 个旧版别名", Object.keys(plugin._views).length === 9, Object.keys(plugin._views).join("|"));
for (const old of ["grid-diary-view", "grid-diary-calendar", "grid-diary-explorer", "grid-diary-timeline"]) {
  ok(`旧标签名已兼容：${old}`, typeof plugin._views[old] === "function");
}
ok("注册了命令（≥18 条）", plugin._commands.length >= 18, String(plugin._commands.length));
const ids = plugin._commands.map((c) => c.id);
for (const id of ["new-entry", "create-today-file", "fill-today-with-template", "images-to-html", "images-to-wiki", "restore-last-deleted", "backup-all"]) {
  ok(`命令存在：${id}`, ids.includes(id));
}
ok("每个模板都有插入命令", ids.filter((x) => x.startsWith("insert-template-")).length === plugin.settings.templates.length);
ok("保留了原有手账主题", plugin.settings.theme === "paper");

console.log("\n[2] 新建日记：内置模板 / 自己的 md 模板");
const f1 = await plugin.createDayFileFor("2026-11-08");
ok("内置模板建在 日记/ 下", f1.path === "日记/2026-11-08.md", f1.path);
ok("内置模板生成 6 个 ##", (f1.content.match(/^## /gm) || []).length === 6);
plugin.settings.dailyTemplatePath = "template模板/日记九宫格模板.md";
const f2 = await plugin.createDayFileFor("2026-11-09");
ok("自定义 md 模板生效", f2.content.includes("## 今日事件") && f2.content.includes("写于 2026年11月09日"), JSON.stringify(f2.content.slice(0, 80)));
ok("{{title}} 已替换", f2.content.includes("# 2026-11-09 的日记"));
plugin.settings.dailyTemplatePath = "";

console.log("\n[3] 同一天多篇（壹 / 贰）");
await plugin.newEntryFor("2026-10-18");
const keys = vault.getFiles().filter((f) => f.path.startsWith("日记/2026-10-18")).map((f) => f.basename).sort();
ok("续出第 贰 篇，未覆盖已有文件", keys.includes("2026-10-18贰") && keys.includes("2026-10-18壹") && keys.includes("2026-10-18"), keys.join("|"));

console.log("\n[4] 用模板补齐格子，旧内容不动");
const n = await plugin.fillMissingCells("2026-11-07", ["今日事件", "今日书账", "今日新知"]);
const after = vault.getAbstractFileByPath("日记/2026-11-07.md").content;
ok("只补 2 个缺的格子", n === 2, String(n));
ok("已有格子的正文原样保留", after.includes("原文不能丢"));
ok("补齐前自动存了快照", [...vault.blobs.keys()].some((p) => p.includes("2026-11-07") && p.includes("补齐格子前")));

console.log("\n[5] 图片互转与撤销");
const imgFile = vault.getAbstractFileByPath("日记/2026-10-19.md");
const c1 = await plugin.convertImages(imgFile, true);
ok("转换了 1 张图片", c1 === 1, String(c1));
ok(".epub 附件没被弄坏", imgFile.content.includes("![[book.epub]]"));
ok("图片转成了 <img> 且保留宽度", imgFile.content.includes('<img src="日记/attachments/a.png" width="400">'));
const c2 = await plugin.convertImages(imgFile, false);
ok("能转回内链", c2 === 1 && imgFile.content.includes("![[a.png|400]]"));
await plugin.history.undo();
ok("撤销回到 <img> 状态", imgFile.content.includes("<img src="));
await plugin.history.redo();
ok("重做回到内链状态", imgFile.content.includes("![[a.png|400]]"));

console.log("\n[6] 误删恢复");
const del = vault.getAbstractFileByPath("日记/2026-10-18贰.md");
const backup = del.content;
plugin.history.recordDelete(del, backup);
await vault.trash(del);
ok("文件已移走", !vault.getAbstractFileByPath("日记/2026-10-18贰.md"));
ok("恢复最近删除成功", await plugin.history.restoreLastDeleted() === true);
ok("恢复后内容一致", vault.getAbstractFileByPath("日记/2026-10-18贰.md").content === backup);

console.log("\n[7] 升级后残留标签页的迁移（对应截图里的「插件不再活动」）");
const migrated = [];
const mkLeaf = (t) => ({
  type: t, detached: false,
  async setViewState(s) { this.type = s.type; migrated.push([t, s.type]); },
  detach() { this.detached = true; },
});
const fakeLeaves = [
  mkLeaf("grid-diary-timeline"), mkLeaf("gd-sidebar-view"),
  mkLeaf("gd-sidebar-view"), mkLeaf("gd-timeline-view"),
];
const origGetLeaves = app.workspace.getLeavesOfType;
app.workspace.getLeavesOfType = (t) => fakeLeaves.filter((l) => l.type === t && !l.detached);
await plugin.migrateLegacyViews();
ok("旧时间线标签被换成新类型", migrated.some(([a, b]) => a === "grid-diary-timeline" && b === "gd-timeline-view"), JSON.stringify(migrated));
ok("重复的目录标签被清理", fakeLeaves.filter((l) => l.type === "gd-sidebar-view" && !l.detached).length === 1);
ok("时间线最终只留一个", fakeLeaves.filter((l) => l.type === "gd-timeline-view" && !l.detached).length === 1);
app.workspace.getLeavesOfType = origGetLeaves;

console.log("\n[8] 四个视图都能构造（防 ItemView 子类覆盖 app 崩加载）");
const leafStub = { app, view: null };
for (const type of ["gd-grid-view", "gd-sidebar-view", "gd-calendar-view", "gd-timeline-view"]) {
  let v = null, err = null;
  try { v = plugin._views[type](leafStub); } catch (e) { err = e; }
  ok(`视图 ${type} 构造成功`, !!v && !err, err ? `${err.constructor.name}: ${err.message}` : "");
}
const gv = plugin._views["gd-grid-view"](leafStub);
ok("视图能拿到 app", gv.app === app, "app 引用丢失");
console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);

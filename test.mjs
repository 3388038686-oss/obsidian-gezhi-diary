/* 逻辑自测：用假的 obsidian 模块加载产物，检查解析 / 往返 / 配置迁移 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let code = fs.readFileSync(path.join(ROOT, "dist/main.js"), "utf8");
code = code.replace(/\}\)\(\);\s*$/, `globalThis.__gd = { parseDay, serializeDay, parsePaste, applyPaste, migrateSettings, buildFromTemplate, buildFromMdTemplate, normalizeCells, DEFAULT_SETTINGS, todayStr, shiftDate, escapeRe, splitDayKey, cnNumber, cnValue, nextCnSuffix, applyVars, convertImageText, normHeadKey, mergeByTitle, chooseLocalFile };\n})();`);

class Base {}
const obsidian = {
  Plugin: Base, PluginSettingTab: Base, ItemView: Base, Modal: Base,
  Setting: Base, Notice: Base, Menu: Base, TFile: Base, TFolder: Base,
  MarkdownRenderer: Base,
  Platform: { isMobile: false, isMobileApp: false },
  normalizePath: (s) => String(s || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
  setIcon: (el, name) => { if (el && el.setAttribute) el.setAttribute("data-icon", String(name || "")); },
};
const sandbox = {
  require: (n) => n === "obsidian" ? obsidian : require(n),
  module: { exports: {} }, console, setTimeout, clearTimeout,
  document: { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, getElementById: () => null },
  navigator: { clipboard: { readText: async () => "" } },
};
vm.createContext(sandbox);
new vm.Script(code, { filename: "main.js" }).runInContext(sandbox);
const G = sandbox.__gd;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " → " + extra : "")); }
}

console.log("\n[1] 真实日记文件解析 & 写入往返");
const real = fs.readFileSync("C:/Users/33880/Documents/my-note/日记/2026-07-01.md", "utf8");
const d = G.parseDay(real);
ok("识别出 6 个格子", d.cells.length === 6, `实际 ${d.cells.length}`);
ok("标题正确", d.cells.map((c) => c.title).join("|") === "今日事件|今日书账|今日新知|今日碎记|今日完成|待办事项", d.cells.map((c) => c.title).join("|"));
ok("正文不丢（含 deepseek 段落）", d.cells[2].content.includes("经过deepseek分析"));
ok("空格子保留", d.cells[0].content === "");
const md = G.serializeDay("2026-07-01", d.cells.map((c) => ({ ...c, cs: 1, rs: 1, h: 0, accent: "" })), { fm: d.fm, h1: d.h1, columns: 2 });
const d2 = G.parseDay(md);
ok("往返后格子数一致", d2.cells.length === d.cells.length);
ok("往返后正文一致", d2.cells[2].content === d.cells[2].content);
ok("往返后布局注释可读", !!d2.layout && d2.layout.cells.length === 6);
ok("frontmatter 日期保留", md.includes("date: 2026-07-01") && md.includes("source: 格间日记"));

console.log("\n[2] 粘贴纯文本解析");
const blankText = "今日事件\n跑了五公里\n\n今日新知\n纸张变黄是氧化\n\n今日反思\n挺好的";
const a = G.parsePaste(blankText, "auto", { pasteFirstLineAsTitle: true });
ok("空行分段 → 3 格", a.length === 3, `实际 ${a.length}`);
ok("首行作标题", a.length === 3 && a[0].title === "今日事件", a.map((x) => x.title).join("|"));
ok("正文不串格", a.length === 3 && a[1].content === "纸张变黄是氧化", a[1] && a[1].content);
const headText = "## 天气\n晴\n\n## 心情\n还行";
const b = G.parsePaste(headText, "auto", {});
ok("## 标题 → 2 格", b.length === 2, `实际 ${b.length}`);
ok("## 标题被去掉", b.length === 2 && b[0].title === "天气", b.map((x) => x.title).join("|"));
const colon = G.parsePaste("情绪：还不错\n身体：有点累", "auto", {});
ok("标题：内容 → 2 格", colon.length === 2, `实际 ${colon.length}`);
ok("冒号内容保留", colon.length === 2 && colon[0].content === "还不错", colon[0] && colon[0].content);
const tbl = "| 日期 | 事件 | 心情 |\n| --- | --- | --- |\n| 周一 | 跑步 | 好 |\n| 周二 | 读书 | 平静 |";
const t = G.parsePaste(tbl, "auto", {});
ok("Markdown 表格 → 3 格（按列）", t.length === 3, `实际 ${t.length}`);
ok("表格列内容汇总", t.length === 3 && t[1].content.includes("跑步") && t[1].content.includes("读书"));
const sep = G.parsePaste("第一段\n内容甲\n---\n第二段\n内容乙", "auto", { pasteSeparator: "---", pasteFirstLineAsTitle: true });
ok("自定义分隔符 → 2 格", sep.length === 2, `实际 ${sep.length}`);
const raw = G.parsePaste("随手写一句话", "raw", {});
ok("兜底整段一格", raw.length === 1 && raw[0].content === "随手写一句话");
const merged = G.applyPaste(
  [{ id: "1", title: "今日事件", content: "已有内容" }],
  [{ title: "今日事件", content: "新内容" }, { title: "新格子", content: "x" }],
  "merge"
);
ok("同名合并", merged.length === 2 && merged[0].content.includes("已有内容") && merged[0].content.includes("新内容"));
ok("新标题追加", merged.length === 2 && merged[1].title === "新格子");

console.log("\n[3] 旧配置迁移");
/* 不再直接读线上 data.json：它早晚会被迁移成 v3，断言就会失效。
 * 这里用一份合成的 v1 配置（照着 v1 的真实字段写），迁移行为与线上等价。 */
const old = {
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
const s = G.migrateSettings(old);
ok("版本标记 v3", s.version === 3);
ok("旧模板转成 cells", s.templates.length === 3 && s.templates[0].cells.length === 6, JSON.stringify(s.templates.map((x) => x.cells.length)));
ok("旧列数/行高映射", s.columns === old.columns && s.rowHeight === old.cellHeight, `${s.columns}/${s.rowHeight}`);
ok("日记目录保留", s.rootFolder === "日记");
ok("默认模板保留", s.activeTemplate === "格间六格");
ok("保留用户原有的手账主题", s.theme === "paper", `实际 ${s.theme}`);
ok("全新安装默认现代卡片主题", G.migrateSettings(null).theme === "card");
ok("v3 新增字段有默认值", s.flow === "vertical" && s.defaultBorder === "hair" && s.cellWidth === 260);
ok("v2 配置也能升到 v3 且不覆盖主题", G.migrateSettings({ version: 2, theme: "bento" }).theme === "bento");
ok("已迁移到 v3 的配置不再改动", G.migrateSettings({ version: 3, theme: "mono" }).theme === "mono");
const built = G.buildFromTemplate("2026-11-07", s.templates[0]);
ok("模板生成文件含 6 个 ##", (built.md.match(/^## /gm) || []).length === 6);
ok("模板生成文件含布局注释", built.md.includes("gd-layout"));
ok("日期工具", G.shiftDate("2026-11-07", -1) === "2026-11-06");

console.log("\n[4] 旧版真实在用：同一天多篇（中文数字）");
const k = G.splitDayKey("2026-10-18壹");
ok("认得 2026-10-18壹.md", k.date === "2026-10-18" && k.suffix === "壹", JSON.stringify(k));
ok("主篇无后缀", G.splitDayKey("2026-10-18").suffix === "");
ok("壹 / 拾 / 拾壹 / 贰拾壹 / 玖拾玖", [1, 10, 11, 21, 99].map(G.cnNumber).join("|") === "壹|拾|拾壹|贰拾壹|玖拾玖", [1, 10, 11, 21, 99].map(G.cnNumber).join("|"));
ok("中文编号可回读", G.cnValue("拾壹") === 11 && G.cnValue("贰拾壹") === 21);
ok("续写自动跳过已用编号", G.nextCnSuffix(["壹", "贰"]) === "叁" && G.nextCnSuffix(["壹", "叁"]) === "贰");

console.log("\n[5] 旧版真实在用：自己的 md 模板与标题级别");
const mdTpl = "# {{title}} 的日记\n建于 {{date:YYYY年MM月DD日}}，{{time:HH:mm}}\n\n## 今日事件\n\n内容写在这\n";
const gen = G.buildFromMdTemplate("2026-11-07", "2026-11-07", mdTpl);
ok("{{title}} 替换", gen.includes("# 2026-11-07 的日记"));
ok("{{date:格式}} 替换", gen.includes("建于 2026年11月07日"));
ok("{{time}} 带格式替换", /，\d{2}:\d{2}/.test(gen));
ok("模板其余内容原样保留", gen.includes("## 今日事件") && gen.includes("内容写在这"));
const lv3 = G.buildFromTemplate("2026-11-07", s.templates[0], 3);
ok("三级标题模板生成 ###", (lv3.md.match(/^### /gm) || []).length === 6);
ok("三级标题能被读回", G.parseDay(lv3.md, 3).cells.length === 6);
const lv3As2 = G.parseDay(lv3.md, 2);
ok("默认读法不会把 ### 拆成格子", lv3As2.cells.length === 1 && lv3As2.cells[0].title === "日记", JSON.stringify(lv3As2.cells.map((c) => c.title)));
ok("兜底整格不丢正文", lv3As2.cells[0].content.includes("今日事件"));

console.log("\n[6] 图片互转：不误伤非图片附件");
const sample = "图一 ![[a.png|400]]\n图二 ![[b.jpg]]\n电子书 ![[book.epub]]\n链接 ![[note.md]]";
const toH = G.convertImageText(sample, true, "日记");
ok("只转 2 张图片", toH.count === 2, `实际 ${toH.count}`);
ok("带宽度保留", toH.text.includes('<img src="日记/attachments/a.png" width="400">'));
ok(".epub 原样不动", toH.text.includes("![[book.epub]]"));
ok("普通内链原样不动", toH.text.includes("![[note.md]]"));
const back = G.convertImageText(toH.text, false, "日记");
ok("往返还原 2 张", back.count === 2 && back.text.includes("![[a.png|400]]") && back.text.includes("![[b.jpg]]"));
ok("往返后 .epub 依然完好", back.text.includes("![[book.epub]]"));

console.log("\n[7] 粘贴：同名标题合并（用户报「同一个标题没写完就新增一个」）");
const pasteSample = [
  "13:24 今日事件", "", "数学两个重要极限", "",
  "11:37 今日书账", "", "第一条书账", "",
  "11:38 今日书账", "", "第二条书账", "",
  "11:39 今日碎记", "", "碎记一", "",
  "11:40 今日碎记", "", "碎记二", "",
  "11:41 今日新知", "", "新知一",
].join("\n");
const pc = G.parsePaste(pasteSample, "auto", {});
ok("4 个同名标题各自合并成一格", pc.length === 4, "实际 " + pc.length + "：" + pc.map((c) => c.title).join("/"));
ok("今日书账把两段都收进来", pc[1].content.includes("第一条书账") && pc[1].content.includes("第二条书账"));
ok("今日碎记把两段都收进来", pc[2].content.includes("碎记一") && pc[2].content.includes("碎记二"));
ok("标题里的时间戳没丢", pc[0].content.includes("13:24"), pc[0].content);
ok("标题本身不含时间戳", pc[0].title === "今日事件", pc[0].title);

const pc2 = G.parsePaste("## 今日书账\n\nA\n\n## 今日书账\n\nB", "auto", {});
ok("不带时间戳的同名标题也合并", pc2.length === 1 && pc2[0].content.includes("A") && pc2[0].content.includes("B"), JSON.stringify(pc2));

console.log("\n[8] 标题归一化");
ok("时间戳被剥掉", G.normHeadKey("13:24 今日事件") === "今日事件");
ok("编号被剥掉", G.normHeadKey("1. 今日书账") === "今日书账");
ok("中文括号编号被剥掉", G.normHeadKey("（一）今日碎记") === "今日碎记");
ok("空格与 markdown 记号被剥掉", G.normHeadKey("**今日 新知**") === "今日新知");

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);

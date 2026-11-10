/* ============ 版本快照 · 撤销 / 重做 ============
 * 快照就是当时那份 md 的原文，存在插件自己的 history/ 目录里。
 * 时间线里的「恢复」、命令里的「撤销」、误删文件都靠它兜底。
 * ================================================ */

class HistoryManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.undoStack = [];
    this.redoStack = [];
    this.lastSnap = new Map();
    this.deleted = [];   // 旧版「恢复最近删除的一条」
  }
  get adapter() { return this.app.vault.adapter; }
  base() { return `.obsidian/plugins/${PLUGIN_ID}/history`; }
  dirFor(file) { return `${this.base()}/${file.basename}`; }

  async ensureFolder(path) {
    let cur = "";
    for (const part of path.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      if (!(await this.adapter.exists(cur))) {
        try { await this.adapter.mkdir(cur); } catch (e) { /* 已存在则忽略 */ }
      }
    }
  }
  async snapshot(file, label, force) {
    if (!file) return null;
    const s = this.plugin.settings;
    if (!force && s.autoSnapshot !== true) {
      // 手动快照仍然写，自动快照受节流限制
      if (label === "自动") return null;
    }
    if (!force && label === "自动") {
      const now = Date.now();
      const last = this.lastSnap.get(file.path) || 0;
      if (now - last < (s.snapshotThrottle || 45) * 1000) return null;
      this.lastSnap.set(file.path, now);
    }
    try {
      const content = await this.app.vault.read(file);
      const d = new Date();
      const stamp = `${fmtDate(d)}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`;
      const folder = this.dirFor(file);
      await this.ensureFolder(folder);
      const path = `${folder}/${stamp}__${slug(label || "手动")}.md`;
      await this.adapter.write(path, content);
      await this.prune(file);
      return path;
    } catch (e) {
      console.error("[格间日记] 快照失败", e);
      return null;
    }
  }
  async list(file) {
    const folder = this.dirFor(file);
    if (!(await this.adapter.exists(folder))) return [];
    const res = await this.adapter.list(folder);
    return (res.files || []).filter((p) => p.endsWith(".md")).map((p) => {
      const name = p.split("/").pop();
      const m = /^(\d{4}-\d{2}-\d{2})-(\d{6})-\d+__(.*)\.md$/.exec(name);
      return {
        path: p, name,
        time: m ? `${m[1]} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}` : name,
        label: m ? m[3].replace(/-/g, " ") : "快照",
      };
    }).sort((a, b) => b.name.localeCompare(a.name));
  }
  async prune(file) {
    const keep = clamp(this.plugin.settings.snapshotsPerDay || 30, 3, 300);
    const all = await this.list(file);
    for (const item of all.slice(keep)) {
      try { await this.adapter.remove(item.path); } catch (e) { /* ignore */ }
    }
  }
  pushUndo(file, content, label) {
    this.undoStack.push({ path: file.path, content, label: label || "编辑", time: Date.now() });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  async undo() {
    const e = this.undoStack.pop();
    if (!e) { new Notice("没有可撤销的操作"); return false; }
    const f = this.app.vault.getAbstractFileByPath(e.path);
    const current = f instanceof TFile ? await this.app.vault.read(f) : "";
    this.redoStack.push({ path: e.path, content: current, label: e.label, time: Date.now() });
    try {
      if (f instanceof TFile) await this.app.vault.modify(f, e.content);
      else await this.app.vault.create(e.path, e.content);
      new Notice(`已撤销：${e.label}`);
      this.plugin.refreshAll(true);
      return true;
    } catch (err) { new Notice("撤销失败：" + err.message); return false; }
  }
  async redo() {
    const e = this.redoStack.pop();
    if (!e) { new Notice("没有可重做的操作"); return false; }
    const f = this.app.vault.getAbstractFileByPath(e.path);
    if (!(f instanceof TFile)) { new Notice("文件不存在，无法重做"); return false; }
    const current = await this.app.vault.read(f);
    this.undoStack.push({ path: e.path, content: current, label: e.label, time: Date.now() });
    await this.app.vault.modify(f, e.content);
    new Notice(`已重做：${e.label}`);
    this.plugin.refreshAll(true);
    return true;
  }
  async restore(file, snapPath) {
    const content = await this.adapter.read(snapPath);
    const current = await this.app.vault.read(file);
    this.pushUndo(file, current, "恢复快照前");
    await this.snapshot(file, "恢复前自动备份", true);
    await this.app.vault.modify(file, content);
    new Notice("已恢复到该版本（恢复前的内容也存了快照）");
    this.plugin.refreshAll(true);
  }
  recordDelete(file, content) {
    this.deleted.push({ path: file.path, content, time: Date.now() });
    if (this.deleted.length > 20) this.deleted.shift();
  }
  async restoreLastDeleted() {
    const e = this.deleted.pop();
    if (!e) { new Notice("没有可恢复的删除记录"); return false; }
    try {
      const parts = e.path.split("/");
      await this.ensureFolder(parts.slice(0, -1).join("/"));
      if (await this.app.vault.adapter.exists(e.path)) { new Notice("这个文件已经存在了"); return false; }
      await this.app.vault.create(e.path, e.content);
      new Notice(`已恢复 ${parts.pop()}`);
      this.plugin.refreshAll(true);
      return true;
    } catch (err) { new Notice("恢复失败：" + err.message); return false; }
  }
  async backupAll() {
    const files = this.plugin.dayFiles();
    let n = 0;
    for (const f of files) { if (await this.snapshot(f, "手动全量备份", true)) n++; }
    new Notice(`已备份 ${n} 篇日记`);
    return n;
  }
  async clearAll() {
    const base = this.base();
    if (!(await this.adapter.exists(base))) return 0;
    const res = await this.adapter.list(base);
    let n = 0;
    for (const dir of res.folders || []) {
      const sub = await this.adapter.list(dir);
      for (const p of sub.files || []) {
        try { await this.adapter.remove(p); n++; } catch (e) { /* ignore */ }
      }
      try { await this.adapter.rmdir(dir, false); } catch (e) { /* ignore */ }
    }
    return n;
  }
}

/* ---------- 小对话框 ---------- */

class ConfirmModal extends Modal {
  constructor(app, title, body, onYes, yesLabel, noLabel, onNo) {
    super(app);
    this.titleText = title; this.bodyText = body; this.onYes = onYes;
    this.yesLabel = yesLabel || "确定";
    this.noLabel = noLabel || "取消";
    this.onNo = onNo || null;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.createEl("h3", { text: this.titleText });
    contentEl.createEl("p", { text: this.bodyText, cls: "gd-modal-desc" });
    const row = contentEl.createDiv({ cls: "gd-modal-actions" });
    const no = row.createEl("button", { text: this.noLabel });
    no.onclick = () => { this.close(); if (this.onNo) this.onNo(); };
    const ok = row.createEl("button", { text: this.yesLabel, cls: "mod-cta" });
    ok.onclick = () => { this.close(); this.onYes(); };
  }
  onClose() { this.contentEl.empty(); }
}

class SnapshotModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin; this.file = file;
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal"); contentEl.addClass("gd-snapshot-modal");
    if (this.modalEl) this.modalEl.style.width = "min(720px, 92vw)";
    contentEl.createEl("h3", { text: `版本历史 · ${this.file.basename}` });
    contentEl.createEl("p", { text: "每次改动前自动留一份原文。恢复前也会先把当前内容存成快照，不会丢东西。", cls: "gd-modal-desc" });
    const list = contentEl.createDiv({ cls: "gd-snap-list" });
    const snaps = await this.plugin.history.list(this.file);
    if (!snaps.length) { list.createEl("p", { text: "还没有快照。", cls: "gd-empty" }); return; }
    const current = await this.app.vault.read(this.file);
    for (const s of snaps) {
      const row = list.createDiv({ cls: "gd-snap-row" });
      const info = row.createDiv({ cls: "gd-snap-info" });
      info.createEl("strong", { text: s.time });
      info.createEl("span", { text: s.label });
      /* 6.2：带上「字数」和「改了什么」，不用点开就能挑 */
      try {
        const txt0 = await this.app.vault.adapter.read(s.path);
        const body0 = String(txt0 || "").replace(/\s/g, "");
        let cells0 = 0;
        try { cells0 = (parseDay(txt0).cells || []).length; } catch (e) { cells0 = 0; }
        const curLen = String(current || "").replace(/\s/g, "").length;
        const diff = body0.length - curLen;
        const dText = diff === 0 ? "字数一样" : (diff > 0 ? "比现在多 " + diff + " 字" : "比现在少 " + (-diff) + " 字");
        info.createEl("i", { cls: "gd-snap-meta", text: `${body0.length} 字 · ${cells0} 格 · ${dText}` });
      } catch (e) { /* 读不到就只显示时间 */ }
      const size = row.createEl("span", { text: "查看", cls: "gd-snap-view" });
      size.onclick = async () => {
        const txt = await this.app.vault.adapter.read(s.path);
        preview.empty();
        preview.createEl("div", { text: `版本 ${s.time}（${txt.length} 字）` , cls: "gd-snap-preview-h"});
        preview.createEl("pre", { text: txt.length > 4000 ? txt.slice(0, 4000) + "\n…" : txt, cls: "gd-snap-preview" });
      };
      const btn = row.createEl("button", { text: "恢复", cls: "gd-mini-btn" });
      btn.onclick = async () => {
        this.close();
        await this.plugin.history.restore(this.file, s.path);
      };
    }
    const preview = contentEl.createDiv({ cls: "gd-snap-preview-wrap" });
    preview.createEl("div", { text: `当前文件 ${current.length} 字 · 点击「查看」可对比内容`, cls: "gd-snap-preview-h" });
  }
  onClose() { this.contentEl.empty(); }
}

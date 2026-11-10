/* ============ 插件主体：视图注册 · 命令 · 联动 ============ */

class GridDiaryPlugin extends Plugin {
  /* 加载期的任何异常都写进插件目录的日志，方便拿真实堆栈定位问题 */
  _reportLoadError(where, e) {
    const msg = "[" + (new Date().toISOString()) + "] " + where + "\n" + ((e && e.stack) || e) + "\n\n";
    try { console.error("[格间日记]", where, e); } catch (_) { }
    try { new Notice("格间日记加载出错（" + where + "）：" + ((e && e.message) || e), 15000); } catch (_) { }
    try {
      const a = this.app && this.app.vault && this.app.vault.adapter;
      if (a && a.append) a.append(".obsidian/plugins/grid-diary/_load-error.log", msg).catch(() => { });
    } catch (_) { }
  }
  async onload() {
    try { await this._onload(); } catch (e) { this._reportLoadError("onload", e); throw e; }
  }
  async _onload() {
    const saved = await this.loadData();
    this.settings = migrateSettings(saved);
    /* 迁移结果立刻落盘：否则每次启动都会判定「版本 < 3」而重复弹升级提示 */
    const _oldVer = Number(saved && saved.version) || 1;
    if (_oldVer < 3) { try { await this.saveData(this.settings); } catch (e) { /* 写失败不影响加载 */ } }
    this.history = new HistoryManager(this);
    this.themes = new ThemeManager(this);
    this.templateCommandIds = [];
    this.templateSig = "";
    this.float = new GDFloat(this);
    this.calPanel = null;   // 浮窗用的那一份，按需创建
    this.tlPanels = [];     // 所有还活着的时间线面板（标签页一份 + 每个浮窗各一份）
    this.tlFloats = [];     // 时间线浮窗的 DOM 列表（支持多开）
    this.notifyRefresh = debounce(() => {
      if (this.sidebarInstance && this.sidebarInstance.render) this.sidebarInstance.render();
      if (this.timelineInstance && this.timelineInstance.refresh) this.timelineInstance.refresh();
      this.refreshAllTimelinePanels();
      if (this.calendarInstance) this.calendarInstance.rebuild();
      if (this.calPanel && this.calPanel.el) this.calPanel.refresh();
      if (this.calendarInstance && this.calendarInstance.panel) this.calendarInstance.panel.refresh();
      if (this.float && this.float.el) this.float.refresh();
    }, 400);

    /* 注册视图必须容错：如果上一份插件实例崩溃时没走到 onunload，
     * 它的视图类型会一直占在 Obsidian 的全局注册表里，
     * 再次 registerView 就会抛 "Attempting to register an existing view type"，
     * 把整个 onload 打断——这正是「插件加载失败」的根因。
     * 所以撞名时先解注册再重试，实在不行就跳过，绝不让加载失败。 */
    const reg = (type, factory) => {
      try { this.registerView(type, factory); return; }
      catch (e) {
        __gdTrace("registerView conflict: " + type);
        try {
          const vr = this.app && this.app.viewRegistry;
          if (vr && typeof vr.unregisterView === "function") vr.unregisterView(type);
        } catch (e2) { __gdTrace("unregister failed: " + type); }
        try { this.registerView(type, factory); return; }
        catch (e3) { __gdTrace("registerView gave up: " + type); }
      }
    };
    reg(VIEW_GRID, (leaf) => this.makeView(VIEW_GRID, leaf));
    reg(VIEW_SIDEBAR, (leaf) => this.makeView(VIEW_SIDEBAR, leaf));
    reg(VIEW_TIMELINE, (leaf) => this.makeView(VIEW_TIMELINE, leaf));
    reg(VIEW_CALENDAR, (leaf) => this.makeView(VIEW_CALENDAR, leaf));
    reg(VIEW_TABLE, (leaf) => this.makeView(VIEW_TABLE, leaf));
    /* workspace.json 里可能还留着 v1 的标签页类型。不注册这些老名字，
     * Obsidian 就会在那些标签上显示「插件不再活动」。 */
    for (const [oldType, newType] of Object.entries(LEGACY_VIEWS)) {
      reg(oldType, (leaf) => this.makeView(newType, leaf));
    }
    this.addSettingTab(new GridSettingTab(this.app, this));
    this.addRibbonIcon(ICON_GRID, "打开格间日记", () => this.openDay(todayStr()));
    this.addRibbonIcon(ICON_SIDEBAR, "日记目录", () => this.openSidebar());
    this.addRibbonIcon(ICON_CALENDAR, "日记日历", () => this.openCalendar());
    this.addRibbonIcon("picture-in-picture-2", "格间日记 · 悬浮窗", () => this.toggleFloat());
    this.addRibbonIcon("calendar-clock", "格间日记 · 日历浮窗", () => { this._allowBootFloat = true; this.toggleCalendar(); });
    this.registerCommands();
    this.registerTemplateCommands();
    this.applyCustomCss();

    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f instanceof TFile) this.notifyRefresh();
    }));
    this.registerEvent(this.app.vault.on("create", () => this.notifyRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.notifyRefresh()));
    this._booting = true;
    this.app.workspace.onLayoutReady(async () => {
      try { await this.themes.installPresets(); } catch (e) { console.warn("[格间日记] 装预设失败", e); }
      if (this.settings.autoApplyTheme && this.settings.activeTheme) {
        try { await this.themes.apply(this.settings.activeTheme, true); } catch (e) { console.warn("[格间日记] 套主题失败", e); }
      }
      await this.migrateLegacyViews();
      /* 用户说过：一启动就自动冒出日历，很烦。
       * 除了「上次没关的标签页被 Obsidian 恢复」这条最容易漏掉的路，
       * 老版视图类型迁移也可能变出一个日历。这里统一关掉。
       * 想用时点侧栏「日历」按钮或命令面板，随时能开。 */
      try { this.closeAllCalendarTabs("启动清理"); } catch (e) { /* 忽略 */ }
      await this.applySidebar();
      /* 页面上看不到图，多半是回收站改名；启动后自动修一轮（可逆） */
      try { await this.autoFixTrashedRefs(); } catch (e) { console.warn("[格间日记] autoFixTrashedRefs", e); }
      await this.openDay(todayStr());
      await this.openTimeline();
      /* 启动时一律不自动弹浮层。
       * 曾经的条件是 floatEnabled && floatRect，结果「只要上次用过」就会每次启动都弹，
       * 用户明确说过不要。现在必须显式打开 floatAutoOpen 才会弹。 */
      if (this.settings.floatAutoOpen === true && this.settings.floatEnabled && !IS_MOBILE) {
        try { await this.float.open(todayStr()); } catch (e) { /* 忽略 */ }
      }
      if (this.settings.calFloatAutoOpen === true && !IS_MOBILE) {
        try { this.openCalendarFloat(); } catch (e) { /* 忽略 */ }
      }
      /* 启动自检：把当时的状态和已经存在的日历叶子写进日志，
       * 下次再出现「一启动就冒出日历」，直接看这份日志就知道是谁开的。 */
      try { this.applyTimeline(); } catch (e) { /* 忽略 */ }
      this.logBoot();
      this._booting = false;
      const v = Number(saved && saved.version) || 1;
      if (v < 3) {
        new Notice("格间日记已升级到 3.0：九宫格支持左右翻页、封面、贴纸与动图了。旧日记原样保留，不会被动改写。", 7000);
      }
    });
  }
  /* 把某个视图类型的标签页全部关掉 */
  closeAllCalendarTabs(why) {
    let leaves = [];
    try { leaves = this.app.workspace.getLeavesOfType(VIEW_CALENDAR) || []; } catch (e) { return; }
    if (!leaves.length) return;
    for (const l of leaves) { try { l.detach(); } catch (e) { /* ignore */ } }
    this.logLine("启动时关掉了 " + leaves.length + " 个日历标签页（" + why + "）");
  }
  /* 往 _boot.log 追加一行 */
  logLine(msg) {
    try {
      const base = this.app.vault.adapter.basePath || "";
      if (!base) return;
      require("fs").appendFileSync(base + "/.obsidian/plugins/grid-diary/_boot.log", "[" + new Date().toISOString() + "] " + msg + "\n");
    } catch (e) { /* ignore */ }
  }
  /* 启动自检：记录浮层状态与已有的日历/浮窗叶子 */
  logBoot() {
    try {
      const s = this.settings;
      const calLeaves = this.app.workspace.getLeavesOfType(VIEW_CALENDAR).length;
      const lines = [
        "[" + new Date().toISOString() + "] 启动",
        "  floatAutoOpen=" + String(s.floatAutoOpen),
        "  calFloatAutoOpen=" + String(s.calFloatAutoOpen),
        "  calPanel=" + String(s.calPanel),
        "  floatEnabled=" + String(s.floatEnabled),
        "  floatRect=" + JSON.stringify(s.floatRect || null),
        "  calFloatRect=" + JSON.stringify(s.calFloatRect || null),
        "  已有日历叶子=" + calLeaves,
        "  浮窗已开=" + !!(this.float && this.float.el),
        "  日历浮窗已开=" + !!this.calFloatEl,
        "",
      ].join("\n");
      const base = this.app.vault.adapter.basePath || "";
      if (!base) return;
      const dir = base + "/.obsidian/plugins/grid-diary";
      try { require("fs").appendFileSync(dir + "/_boot.log", lines); } catch (e) { }
    } catch (e) { /* 自检失败不影响启动 */ }
  }
  onunload() {
    const st = document.getElementById("gd-custom-css");
    if (st) st.remove();
    if (this.float) this.float.close();
    try { this.closeCalendarFloat(); } catch (e) { }
    try { this.closeAllTimelineFloats(); } catch (e) { }
  }
  /* 统一造视图，避免 registerView 里写四段 if */
  makeView(type, leaf) {
    let v = null;
    try {
      if (type === VIEW_GRID) { v = new GridView(leaf, this); this.gridInstance = v; }
      else if (type === VIEW_SIDEBAR) { v = new SidebarView(leaf, this); this.sidebarInstance = v; }
      else if (type === VIEW_CALENDAR) { v = new CalendarView(leaf, this); this.calendarInstance = v; }
      else if (type === VIEW_TABLE) { v = new TableView(leaf, this); this.tableInstance = v; }
      else { v = new TimelineView(leaf, this); this.timelineInstance = v; }
    } catch (e) {
      this._reportLoadError("makeView:" + type, e);
      throw e;
    }
    /* 视图渲染期的异常不要变成白屏：接住、记日志、把错误直接显示在标签页里 */
    const orig = v.onOpen ? v.onOpen.bind(v) : null;
    if (orig) {
      const self = this;
      v.onOpen = async function () {
        try { return await orig(); }
        catch (e) {
          self._reportLoadError("onOpen:" + type, e);
          try {
            v.contentEl.empty();
            v.contentEl.createEl("h3", { text: "格间日记渲染出错" });
            v.contentEl.createEl("pre", { text: ((e && e.stack) || String(e)) });
            v.contentEl.createEl("p", { text: "详细堆栈已写入 .obsidian/plugins/grid-diary/_load-error.log" });
          } catch (_) { }
        }
      };
    }
    return v;
  }
  /* 确保格间日记主视图是打开的（命令在没有视图时也能用） */
  async activateGrid() {
    try {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_GRID);
      if (leaves && leaves.length) { this.app.workspace.setActiveLeaf(leaves[0], { focus: true }); return true; }
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_GRID, active: true });
      return true;
    } catch (e) {
      new Notice("打开格间日记失败：" + (e && e.message ? e.message : e));
      return false;
    }
  }

  registerCommands() {
    /* 所有命令都套一层：出错不吞掉，弹 Notice 说清是哪条命令、什么错。
     * 之前用户报「命令加了没反应」，就是因为异常被 Obsidian 吞了，界面上毫无提示。 */
    const add = (id, name, fn, icon) => this.addCommand({
      id, name,
      ...(icon ? { icon } : { icon: "layout-grid" }),
      callback: async (evt) => {
        try {
          await fn(evt);
        } catch (e) {
          console.error("[格间日记] 命令 " + id + " 失败", e);
          new Notice("「" + name + "」执行失败：" + (e && e.message ? e.message : e), 8000);
        }
      },
    });
    add("open-today", "打开今天的日记", () => this.openDay(todayStr()), "calendar-check");
    add("paste-to-grid", "粘贴纯文本生成格子", () => new PasteModal(this.app, this, "").open(), "clipboard-paste");
    add("add-cell", "新增一个格子", async () => {
      const v = this.gridView();
      if (!v) { new Notice("先打开格间日记视图再新增格子"); await this.activateGrid(); return; }
      v.addCell();
    }, "plus-square");
    add("apply-template", "套用格子模板", () => new TemplateModal(this.app, this).open(), "layout-template");
    add("toggle-theme", "切换页面风格（五套）", async () => {
      const list = THEMES.map((t) => t[0]);
      const i = list.indexOf(this.settings.theme || "card");
      this.settings.theme = list[(i + 1) % list.length];
      await this.saveSettings(); this.refreshAll();
      const nm = (THEMES.find((t) => t[0] === this.settings.theme) || ["", "现代卡片"])[1];
      new Notice(`已切换到「${nm}」`);
    }, "palette");
    add("cycle-border", "切换格子边框（五种）", async () => {
      const list = BORDERS.map((t) => t[0]);
      const i = list.indexOf(this.settings.defaultBorder || "hair");
      this.settings.defaultBorder = list[(i + 1) % list.length];
      await this.saveSettings(); this.refreshAll(true);
      const nm = (BORDERS.find((t) => t[0] === this.settings.defaultBorder) || ["", "细线"])[1];
      new Notice(`默认边框：${nm}`);
    }, "square");
    add("toggle-flow", "切换上下滚 / 左右滚 / 左右翻页", async () => {
      const list = GRID_FLOWS.map((t) => t[0]);
      const i = list.indexOf(this.settings.flow || "vertical");
      this.settings.flow = list[(i + 1) % list.length];
      await this.saveSettings(); this.refreshAll();
      const nm = (GRID_FLOWS.find((t) => t[0] === this.settings.flow) || ["", "上下滚"])[1];
      new Notice(`排布：${nm}`);
    }, "move-horizontal");
    add("toggle-float", "打开 / 关闭灵感笔记悬浮窗", () => this.toggleFloat(), "sticky-note");
    add("open-float-today", "在悬浮窗里记今天", async () => { await this.float.open(todayStr()); }, "sticky-note");
    add("toggle-preview", "切换编辑 / Markdown 预览", async () => {
      const v = this.gridView();
      if (!v) { await this.activateGrid(); new Notice("已打开格间日记，再点一次即可切换预览"); return; }
      v.previewMode = !v.previewMode; v.render();
    }, "eye");
    add("undo", "撤销上一次改动", () => this.history.undo(), "undo-2");
    add("redo", "重做", () => this.history.redo(), "redo-2");
    add("snapshot", "立即保存一个版本", async () => {
      const v = this.gridView();
      if (!v || !v.file) { new Notice("请先打开日记"); return; }
      await this.history.snapshot(v.file, "手动", true);
      new Notice("已保存快照");
    }, "camera");
    add("snapshots", "查看版本历史 / 恢复", () => {
      const v = this.gridView();
      if (v && v.file) new SnapshotModal(this.app, this, v.file).open();
      else new Notice("请先打开日记");
    }, "history");
    add("backup-all", "备份全部日记到版本库", () => this.history.backupAll(), "hard-drive-download");
    add("restore-last-deleted", "恢复最近删除的一篇日记", () => this.history.restoreLastDeleted(), "trash-2");
    add("open-sidebar", "打开日记目录", () => this.openSidebar(), "panel-left");
    add("toggle-calendar-float", "打开 / 关闭日历浮窗（可拖可缩放）", () => { this._allowBootFloat = true; this.toggleCalendar(); }, "calendar-clock");
    add("open-calendar", "打开日记日历", () => this.openCalendar(), "calendar-days");
    add("toggle-calendar", "切换日记日历（按设置走标签页或浮窗）", () => { this._allowBootFloat = true; if (this.settings.calPanel === "float") this.toggleCalendar(); else this.openCalendar(); }, "calendar-range");
    add("open-table", "用表格打开这一天", () => this.openTable(this.keyOfGridView()), "table");
    add("open-timeline", "打开时间线", () => this.openTimeline(), "git-branch");
    add("open-timeline-float", "打开时间线浮窗（可多开）", () => this.openTimelineFloat(), "git-branch");
    add("toggle-timeline-float", "切换时间线浮窗", () => this.toggleTimelineFloat(), "git-branch");
    add("open-settings", "打开格间日记设置", () => this.openSettings(), "settings");
    add("repair-links", "扫描并修复断链的图片（回收站改名导致）", () => this.openRepairLinks(), "link-2-off");
    add("theme-menu", "主题：选择 / 保存 / 回滚", (evt) => this.showThemeMenu(evt), "palette");
    add("theme-save", "主题：把当前设置存成主题", () => {
      new PromptModal(this.app, "存成新主题", "主题名字", this.settings.activeTheme || "我的主题", async (v) => {
        await this.saveThemeAs(v, "从当前设置新建");
      }).open();
    }, "save");
    add("theme-history", "主题：版本历史 / 回滚", () => this.openThemeHistory(), "history");
    add("new-entry", "在这一天再写一篇（壹 / 贰 / 叁…）", async () => {
      const v = this.gridView();
      await this.newEntryFor(v ? splitDayKey(v.key).date : todayStr());
    }, "file-plus-2");
    add("create-today-file", "新建今天的日记文件", async () => {
      await this.createDayFileFor(todayStr());
      await this.openDay(todayStr());
      new Notice("已新建今天的日记");
    }, "file-plus");
    add("fill-today-with-template", "用默认模板补齐今天的格子", async () => {
      const key = todayStr();
      await this.createDayFileFor(key);
      const tpl = this.settings.templates.find((t) => t.name === this.settings.activeTemplate) || this.settings.templates[0];
      const n = await this.fillMissingCells(key, (tpl.cells || []).map((c) => c.title));
      new Notice(n ? `已补齐 ${n} 个格子` : "今天的格子已经齐了");
      await this.openDay(key);
    }, "list-checks");
    add("images-to-html", "把当前文件的图片转成通用 <img>（导出用）", async () => {
      const f = this.app.workspace.getActiveFile();
      if (!f) { new Notice("先打开一个文件"); return; }
      const n = await this.convertImages(f, true);
      new Notice(n ? `已转换 ${n} 张图片` : "没有需要转换的图片");
    }, "image");
    add("images-to-wiki", "把当前文件的 <img> 还原成 Obsidian 内链", async () => {
      const f = this.app.workspace.getActiveFile();
      if (!f) { new Notice("先打开一个文件"); return; }
      const n = await this.convertImages(f, false);
      new Notice(n ? `已还原 ${n} 张图片` : "没有需要还原的图片");
    }, "image");
  }

  /* ---------- 孤儿图片链接：扫描 / 修复 ----------
   * 症状：格子里直接显示 ".trashed-1795862815-retouch_xxx.png|420]]" 这样的源码。
   * 原因：Obsidian 本地回收站把附件改名成 ".trashed-<id>-原名"，但 md 里的引用没跟着改；
   *      以 "." 开头的文件被当成隐藏文件，Obsidian 不再当图片解析。
   * 做法：把附件名改回原名（重名就加序号），再把 md 里的引用替换成新名字。 */

  /* 扫出所有指向 .trashed- 文件、或指向不存在文件的图片链接 */
  async scanBrokenLinks() {
    const folder = normalizePath(this.settings.rootFolder || "日记");
    const list = [];
    for (const f of this.dayFiles()) {
      let text = "";
      try { text = await this.app.vault.read(f); } catch (e) { continue; }
      const re = /(!?)\[\[([^\]|#]+?)(\|[^\]]*)?\]\]/g;
      let m;
      while ((m = re.exec(text))) {
        const target = (m[2] || "").trim();
        if (!target || /^https?:/i.test(target)) continue;
        if (!/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target)) continue;
        const base = target.split("/").pop();
        const isTrashed = /\.trashed-\d+-/.test(base);
        const dest = this.app.metadataCache.getFirstLinkpathDest(target, f.path);
        if (dest && !isTrashed) continue;
        if (!dest && !isTrashed) {
          list.push({ file: f, raw: m[0], target, kind: "missing" });
          continue;
        }
        list.push({ file: f, raw: m[0], target, kind: "trashed" });
      }
    }
    return list;
  }

  /* 修：把 .trashed-xxx 改回原名，并更新所有引用 */
  async repairBrokenLinks() {
    const found = await this.scanBrokenLinks();
    if (!found.length) { new Notice("没有发现断链的图片"); return; }
    const folder = normalizePath(this.settings.rootFolder || "日记");
    const atDir = this.attachDir();
    let fixed = 0;
    const skip = [];
    const renameMap = new Map();   // 旧名 → 新名

    for (const item of found) {
      if (item.kind !== "trashed") { skip.push(item); continue; }
      const base = item.target.split("/").pop();
      const clean = base.replace(/^\.trashed-\d+-/, "");
      if (!clean || clean === base) { skip.push(item); continue; }
      if (renameMap.has(base)) { fixed++; continue; }

      const oldPath = normalizePath(atDir + "/" + base);
      const src = this.app.vault.getAbstractFileByPath(oldPath);
      if (!src) { skip.push(item); continue; }

      let newPath = normalizePath(atDir + "/" + clean);
      if (this.app.vault.getAbstractFileByPath(newPath)) {
        newPath = normalizePath(atDir + "/" + Date.now() + "-" + clean);
      }
      try {
        await this.app.fileManager.renameFile(src, newPath);
        renameMap.set(base, newPath.split("/").pop());
        fixed++;
      } catch (e) {
        skip.push(item);
      }
    }

    /* 逐个文件把引用换成新名 */
    let touched = 0;
    if (renameMap.size) {
      for (const f of this.dayFiles()) {
        let text = "";
        try { text = await this.app.vault.read(f); } catch (e) { continue; }
        let next = text;
        for (const [oldName, newName] of renameMap) {
          next = next.split(oldName).join(newName);
        }
        if (next !== text) {
          await this.vault_modify(f, next);
          touched++;
        }
      }
    }

    this.refreshAll(true);
    const msg = [
      `修好 ${fixed} 张图片，更新 ${touched} 篇日记`,
      skip.length ? `另有 ${skip.length} 处要你手动处理` : "",
    ].filter(Boolean).join("；");
    new Notice(msg, 8000);
  }

  /* ---------- 自动修复被回收站改名的封面 / 照片 ----------
   * 用户报「图片他就是无法渲染出来」，实测 layout.cover 里存着
   *   "日记/attachments/.trashed-1794403037-IMG_20261010_213121.jpg"
   * 这种路径 . 开头 = 隐藏文件，Obsidian 一律不当图片解析，所以怎么点都是空的。
   * 这里在启动后跑一次：把附件名改回原名，再把新名写回 layout。 */
  async autoFixTrashedRefs() {
    const atDir = this.attachDir();
    const renameMap = new Map();       // 旧文件名 → 新文件名
    const touched = [];
    for (const f of this.dayFiles()) {
      let raw = "";
      try { raw = await this.app.vault.read(f); } catch (e) { continue; }
      if (raw.indexOf(".trashed-") < 0) continue;
      const parsed = parseDay(raw, this.settings.headingLevel);
      const lay = normalizeLayout(parsed.layout, this.settings);
      let changed = false;
      for (const k of ["cover", "photo"]) {
        const v = lay[k];
        if (!v || typeof v !== "string") continue;
        const base = v.split("/").pop();
        if (!/\.trashed-\d+-/.test(base)) continue;
        if (renameMap.has(base)) { lay[k] = atDir + "/" + renameMap.get(base); changed = true; continue; }
        const clean = base.replace(/^\.trashed-\d+-/, "");
        const oldPath = normalizePath(atDir + "/" + base);
        const src = this.app.vault.getAbstractFileByPath(oldPath);
        if (!src) continue;             // 文件本身没了，留着不动
        let newPath = normalizePath(atDir + "/" + clean);
        if (this.app.vault.getAbstractFileByPath(newPath)) newPath = normalizePath(atDir + "/" + Date.now() + "-" + clean);
        try {
          await this.app.fileManager.renameFile(src, newPath);
          const newName = newPath.split("/").pop();
          renameMap.set(base, newName);
          lay[k] = newPath;
          changed = true;
        } catch (e) { /* 改不动就跳过，不影响启动 */ }
      }
      if (!changed) continue;
      try {
        const cells = normalizeCells(parsed.cells, lay, this.settings);
        const md = serializeDay(splitDayKey(f.basename).date, cells, {
          fm: parsed.fm, h1: parsed.h1,
          columns: lay.cols || (parsed.layout && parsed.layout.cols) || this.settings.columns,
          level: this.settings.headingLevel, layout: lay,
        });
        await this.app.vault.modify(f, md);
        touched.push(f.basename);
      } catch (e) { /* ignore */ }
    }
    /* 正文里的 ![[.trashed-xxx]] 也一起换掉 */
    if (renameMap.size) {
      for (const f of this.dayFiles()) {
        let raw = "";
        try { raw = await this.app.vault.read(f); } catch (e) { continue; }
        if (raw.indexOf(".trashed-") < 0) continue;
        let next = raw;
        for (const [oldName, newName] of renameMap) next = next.split(oldName).join(newName);
        if (next !== raw) {
          try { await this.app.vault.modify(f, next); if (!touched.includes(f.basename)) touched.push(f.basename); } catch (e) { }
        }
      }
    }
    if (touched.length) {
      console.log("[格间日记] 已修复回收站改名的图片引用：", touched.join(", "));
      new Notice("修好了 " + renameMap.size + " 张图（回收站改名导致显示不出来），涉及 " + touched.length + " 篇日记", 6000);
      this.refreshAll(true);
    }
    return touched.length;
  }

  /* 命令里用：先扫再问，允许用户自己决定 */
  async openRepairLinks() {
    const found = await this.scanBrokenLinks();
    if (!found.length) { new Notice("没有发现断链的图片，一切正常"); return; }
    const lines = found.slice(0, 8).map((x) => "· " + x.target).join("\n");
    new ConfirmModal(this.app, "发现 " + found.length + " 处断链",
      "多为 Obsidian 回收站改名（.trashed-…）后引用没跟着改。\n修法是把附件名改回原名，并同步更新笔记里的引用。\n\n" + lines + (found.length > 8 ? "\n…" : ""),
      () => this.repairBrokenLinks(), "修好它们").open();
  }

  /* 小包装：vault.modify 包一层，方便统一打点 */
  async vault_modify(file, data) {
    try { await this.app.vault.modify(file, data); }
    catch (e) { new Notice("写入失败：" + e.message); }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyCustomCss();
    this.registerTemplateCommands();
    try { this.applyTimeline(); } catch (e) { /* 忽略 */ }
  }
  registerTemplateCommands() {
    const sig = this.settings.templates.map((t) => `${t.name}:${(t.cells || []).map((c) => c.title).join(",")}`).join("|");
    if (sig === this.templateSig) return;
    this.templateSig = sig;
    /* 公开 API 没有 removeCommand，旧版只能走内部 commands；两条路都试，失败也不影响加载 */
    const rm = (id) => {
      try {
        if (typeof this.removeCommand === "function") this.removeCommand(id);
        else if (this.app.commands && typeof this.app.commands.removeCommand === "function") this.app.commands.removeCommand(id);
      } catch (e) { /* ignore */ }
    };
    for (const id of this.templateCommandIds) rm(id);
    this.templateCommandIds = [];
    for (const tpl of this.settings.templates) {
      const id = `insert-template-${tpl.name.replace(/[^\w\u4e00-\u9fa5]+/g, "-")}`;
      this.addCommand({
        id, name: `插入模板：${tpl.name}`,
        callback: async () => {
          const key = todayStr();
          await this.createDayFileFor(key);
          const n = await this.fillMissingCells(key, (tpl.cells || []).map((c) => c.title));
          new Notice(n ? `已补齐 ${n} 个格子` : "这个模板的格子已经有了");
          await this.openDay(key);
        },
      });
      this.templateCommandIds.push(id);
    }
  }
  async ensureFolder(path) {
    const p = normalizePath(path);
    if (!p || p === "/") return;
    let cur = "";
    for (const part of p.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      const exists = await this.app.vault.adapter.exists(cur);
      if (!exists) { try { await this.app.vault.adapter.mkdir(cur); } catch (e) { /* ignore */ } }
    }
  }

  /* 附件目录：日记根 / 设置的子目录名（默认 attachments） */
  attachDir() {
    const root = this.settings.rootFolder || "日记";
    const sub = (this.settings.attachFolder || "attachments").replace(/^\/+|\/+$/g, "");
    return normalizePath(sub ? root + "/" + sub : root);
  }
  /* 目录里出现过哪些文件夹（含根 ""）：给设置页的「每个文件夹一张缩略图」列清单用 */
  folderKeysForStyle() {
    const root = normalizePath(this.settings.rootFolder || "日记");
    const s = this.settings;
    const keys = new Set([""]);
    for (const f of this.app.vault.getFiles() || []) {
      if (f.path.includes("/.")) continue;
      if (f.extension !== "md") continue;
      const inRoot = f.path.startsWith(root + "/");
      if (!inRoot && !s.treeShowOtherFiles) continue;
      const rel = inRoot ? f.path.slice(root.length + 1) : f.path;
      const dirs = rel.split("/").slice(0, -1);
      let acc = "";
      for (const p of dirs) { acc = acc ? acc + "/" + p : p; keys.add(acc); }
    }
    return [...keys].sort((a, b) => a.localeCompare(b, "zh"));
  }

  dayFiles() {
    const root = normalizePath(this.settings.rootFolder || "日记");
    const prefix = (root && root !== "/") ? root + "/" : "";
    return this.app.vault.getFiles()
      .filter((f) => f.extension === "md" && f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes("/") && DATE_RE.test(f.name))
      .sort((a, b) => {
        const da = splitDayKey(a.basename), db = splitDayKey(b.basename);
        if (da.date !== db.date) return db.date.localeCompare(da.date);
        const va = cnValue(da.suffix), vb = cnValue(db.suffix);
        return (Number.isFinite(va) ? va : 999) - (Number.isFinite(vb) ? vb : 999);
      });
  }
  /* 新建一篇日记：优先用自己写的 md 模板文件，其次用插件内的格子模板 */
  async createDayFileFor(key) {
    const { date } = splitDayKey(key);
    const folder = normalizePath(this.settings.rootFolder || "日记");
    const path = `${folder}/${key}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    await this.ensureFolder(folder);
    let text = "";
    const tplPath = (this.settings.dailyTemplatePath || "").trim();
    if (tplPath) {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(tplPath));
      if (f instanceof TFile) {
        text = buildFromMdTemplate(key, date, await this.app.vault.read(f));
      } else new Notice(`模板文件不存在：${tplPath}`);
    }
    if (!text) {
      const tpl = this.settings.templates.find((t) => t.name === this.settings.activeTemplate) || this.settings.templates[0];
      text = buildFromTemplate(date, tpl || { cells: [] }, this.settings.headingLevel).md;
    }
    return await this.app.vault.create(path, text);
  }
  /* 同一天再写一篇：主篇 → 壹 → 贰 … 最多 99 篇。
   * 不能只信 dayFiles()：vault 的文件索引是异步刷新的，刚 create 出来的那一篇
   * 可能还没进索引，于是第二次点「＋篇」又算出同一个后缀、命中 createDayFileFor
   * 的「已存在就返回」，看起来就像「加不上第二篇」。
   * 所以这里逐个后缀去问 getAbstractFileByPath，拿到真正没被占用的那个。 */
  async newEntryFor(date) {
    const d = splitDayKey(date).date || date;
    const folder = normalizePath(this.settings.rootFolder || "日记");
    const used = new Set(
      this.dayFiles()
        .filter((f) => splitDayKey(f.basename).date === d)
        .map((f) => splitDayKey(f.basename).suffix)
    );
    let suffix = "";
    for (let i = 1; i <= 99; i++) {
      const s = cnNumber(i);
      if (!s || used.has(s)) continue;
      if (this.app.vault.getAbstractFileByPath(`${folder}/${d}${s}.md`)) { used.add(s); continue; }
      suffix = s;
      break;
    }
    if (!suffix) { new Notice("这一天的篇数已经满了（99 篇）"); return; }
    const key = d + suffix;
    const f = await this.createDayFileFor(key);
    if (!f) { new Notice("新建失败：没有拿到文件"); return; }
    await this.openDay(key);
    new Notice(`已新建第 ${suffix} 篇`);
  }
  /* 用模板补齐缺失的格子，已有内容一格不动 */
  async fillMissingCells(key, titles) {
    const f = this.app.vault.getAbstractFileByPath(`${normalizePath(this.settings.rootFolder || "日记")}/${key}.md`);
    if (!(f instanceof TFile)) { new Notice("这一天还没有文件"); return 0; }
    const parsed = parseDay(await this.app.vault.read(f), this.settings.headingLevel);
    const exist = new Set(parsed.cells.map((c) => c.title));
    let added = 0;
    for (const t of titles) {
      if (!exist.has(t)) {
        parsed.cells.push({ title: t, content: "", cs: 1, rs: 1, h: 0, accent: "", border: "", sticker: "" });
        added++;
      }
    }
    if (added) {
      await this.history.snapshot(f, "补齐格子前", true);
      const cells = parsed.cells.map((c) => ({ ...c, cs: c.cs || 1, rs: c.rs || 1, h: c.h || 0, accent: c.accent || "" }));
      await this.app.vault.modify(f, serializeDay(splitDayKey(key).date, cells, {
        fm: parsed.fm, h1: parsed.h1, columns: this.settings.columns,
        level: this.settings.headingLevel, layout: parsed.layout,
      }));
      this.refreshAll(true);
    }
    return added;
  }
  /* 旧版同款命令，但只认图片后缀：日记里有 .epub 之类附件，不能被转成 <img> */
  async convertImages(file, toHtml) {
    let count = 0;
    const before = await this.app.vault.read(file);
    if (toHtml) await this.history.snapshot(file, "转 <img> 前", true);
    const folder = normalizePath(this.settings.rootFolder || "日记");
    await this.app.vault.process(file, (data) => {
      const r = convertImageText(data, toHtml, folder);
      count = r.count;
      return r.text;
    });
    if (count) this.history.pushUndo(file, before, toHtml ? "图片转 HTML" : "图片还原内链");
    return count;
  }
  gridView() {
    const l = this.app.workspace.getLeavesOfType(VIEW_GRID)[0];
    return l && (l.view instanceof GridView) ? l.view : null;
  }
  get sidebar() { return this.sidebarInstance || null; }
  get timeline() { return this.timelineInstance || null; }
  get calendar() { return this.calendarInstance || null; }
  get table() { return this.tableInstance || null; }

  /* 用表格形态打开某一天（左目录 + 右表格） */
  async openTable(key) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TABLE)[0];
    if (!leaf) leaf = this.app.workspace.getLeaf(true);
    if (!leaf) { new Notice("打不开表格视图"); return; }
    await leaf.setViewState({ type: VIEW_TABLE, state: { key: key || todayStr() }, active: true });
    this.app.workspace.revealLeaf(leaf);
    const v = leaf.view;
    if (v && v.openKey) await v.openKey(key || todayStr());
  }

  async openDay(key) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_GRID)[0];
    if (!leaf) leaf = this.app.workspace.getLeaf(true);
    if (!leaf) { new Notice("打不开日记视图：请先切换到有主编辑区的布局"); return; }
    await leaf.setViewState({ type: VIEW_GRID, active: true });
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof GridView) await view.openDay(key);
    if (this.timeline) this.timeline.setActive(key);
    if (this.float && this.float.el) this.float.refresh(key);
    this.notifyRefresh();
  }
  async openCalendar() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_CALENDAR)[0];
    if (!leaf) {
      leaf = this.settings.calendarPlacement === "right"
        ? (this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true))
        : this.app.workspace.getLeaf(true);
    }
    if (!leaf) { new Notice("打不开日历视图"); return; }
    await leaf.setViewState({ type: VIEW_CALENDAR, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  /* 同一天里下一个可用的中文后缀（壹 / 贰 / 叁…），不建文件只算名字 */
  nextKeyFor(date) {
    const d = splitDayKey(date).date || date;
    const folder = normalizePath(this.settings.rootFolder || "日记");
    const used = new Set(
      this.dayFiles().filter((f) => splitDayKey(f.basename).date === d).map((f) => splitDayKey(f.basename).suffix)
    );
    for (let i = 1; i <= 99; i++) {
      const s = cnNumber(i);
      if (!s || used.has(s)) continue;
      if (this.app.vault.getAbstractFileByPath(folder + "/" + d + s + ".md")) { used.add(s); continue; }
      return d + s;
    }
    return d;
  }

  /* 日历：在标签页和浮窗之间切换 */
  /* 命令面板里的「日历浮窗」永远开浮窗，不受 calPanel 设置影响
   * （用户要求：日历是悬浮窗模式也要在命令里面） */
  toggleCalendar() {
    if (this.calFloatEl) this.closeCalendarFloat();
    else this.openCalendarFloat();
  }

  openCalendarFloat() {

    if (this.calFloatEl) { return; }
    if (!this.calPanel) this.calPanel = new CalendarPanel(this);
    const wrap = document.createElement("div");
    wrap.addClass("gd-root");
    wrap.addClass("gd-cal-float");
    wrap.addClass("gd-theme-" + (this.settings.theme || "card"));
    const r = this.settings.calFloatRect || {};
    const w = clamp(r.width || 760, 380, 1400);
    const h = clamp(r.height || 620, 320, 1100);
    const vw = window.innerWidth, vh = window.innerHeight;
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    wrap.style.left = clamp(r.left != null ? r.left : vw - w - 40, 0, Math.max(0, vw - w)) + "px";
    wrap.style.top = clamp(r.top != null ? r.top : 80, 0, Math.max(0, vh - h)) + "px";
    /* B5：壁纸不铺满整块，只在顶部占一条 banner，内容往下排，绝不重合 */
    if (this.settings.calFloatWallOnTop) wrap.addClass("is-walltop");

    /* 纯色底 + 可调透明度 + 磨砂（用户反馈"背景透明度太多，看不清字"） */
    const bg = this.settings.calFloatBg;
    if (bg) wrap.style.setProperty("--gd-cal-float-bg", bg);
    wrap.style.setProperty("--gd-cal-float-op", String(clamp(this.settings.calFloatOpacity == null ? 0.96 : this.settings.calFloatOpacity, 0.4, 1)));
    wrap.style.setProperty("--gd-cal-float-blur", clamp(this.settings.calFloatBlur || 0, 0, 24) + "px");
    if (this.settings.calFloatShadow === false) wrap.addClass("is-no-shadow");
    document.body.appendChild(wrap);
    this.calFloatEl = wrap;

    /* 拖动条 */
    const bar = wrap.createDiv({ cls: "gd-cal-float-bar" });
    bar.createDiv({ cls: "gd-cal-float-title", text: "日历" });
    const closeBtn = bar.createEl("button", { cls: "gd-cal-float-x", text: "×" });
    closeBtn.onclick = () => this.closeCalendarFloat();
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === closeBtn) return;
      drag = { x: e.clientX, y: e.clientY, l: parseFloat(wrap.style.left) || 0, t: parseFloat(wrap.style.top) || 0 };
      wrap.addClass("is-dragging");
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      wrap.style.left = clamp(drag.l + e.clientX - drag.x, 0, window.innerWidth - 120) + "px";
      wrap.style.top = clamp(drag.t + e.clientY - drag.y, 0, window.innerHeight - 80) + "px";
    });
    bar.addEventListener("pointerup", (e) => {
      if (!drag) return;
      drag = null;
      wrap.removeClass("is-dragging");
      try { bar.releasePointerCapture(e.pointerId); } catch (err) { }
      this.saveCalFloatRect(wrap);
    });
    this._calEsc = (e) => { if (e.key === "Escape") this.closeCalendarFloat(); };
    window.addEventListener("keydown", this._calEsc);

    /* 缩放柄（原来只有拖动，没有缩放，用户报"日历无法缩小放大"）。
       现在四个角都有（「四角能拖（不显眼）」），右下那个是原来那个大一点的。 */
    const grip = wrap.createDiv({ cls: "gd-cal-grip", attr: { title: "拖动缩放（双击回到默认大小）" } });
    let rsz = null;
    const startCalResize = (ev, corner) => {
      ev.stopPropagation();
      rsz = { x: ev.clientX, y: ev.clientY, w: wrap.offsetWidth, h: wrap.offsetHeight, l: parseFloat(wrap.style.left) || 0, t: parseFloat(wrap.style.top) || 0, c: corner || "se" };
      wrap.addClass("is-resizing");
      ev.currentTarget.setPointerCapture(ev.pointerId);
    };
    grip.addEventListener("pointerdown", (e) => startCalResize(e, "se"));
    for (const c of ["nw", "ne", "sw"]) {
      const g = wrap.createDiv({ cls: "gd-cal-corner is-" + c });
      g.addEventListener("pointerdown", (e) => startCalResize(e, c));
    }
    const doResize = (e) => {
      if (!rsz) return;
      const dx = e.clientX - rsz.x, dy = e.clientY - rsz.y;
      let w = rsz.w, h = rsz.h, left = rsz.l, top = rsz.t;
      if (rsz.c.includes("e")) w = rsz.w + dx;
      if (rsz.c.includes("s")) h = rsz.h + dy;
      if (rsz.c.includes("w")) { w = rsz.w - dx; left = rsz.l + dx; }
      if (rsz.c.includes("n")) { h = rsz.h - dy; top = rsz.t + dy; }
      w = clamp(Math.round(w), 320, 1400);
      h = clamp(Math.round(h), 260, 1100);
      wrap.style.width = w + "px";
      wrap.style.height = h + "px";
      if (rsz.c.includes("w")) wrap.style.left = clamp(Math.round(left), 0, window.innerWidth - 120) + "px";
      if (rsz.c.includes("n")) wrap.style.top = clamp(Math.round(top), 0, window.innerHeight - 60) + "px";
    };
    const endResize = () => {
      if (!rsz) return;
      rsz = null;
      wrap.removeClass("is-resizing");
      this.saveCalFloatRect(wrap);
    };
    wrap.addEventListener("pointermove", doResize);
    wrap.addEventListener("pointerup", endResize);
    wrap.addEventListener("pointercancel", endResize);
    grip.addEventListener("dblclick", () => {
      wrap.style.width = "760px";
      wrap.style.height = "620px";
      this.saveCalFloatRect(wrap);
    });

    const host = wrap.createDiv({ cls: "gd-cal-float-body" });
    this.calPanel.inFloat = true;
    this.calPanel.openInPane(host);
    this.applyCalCollapsed();
  }

  /* 日历折叠成一条细边时，浮窗外壳也得跟着缩短，不然会留一大片空壳 */
  applyCalCollapsed() {
    const w = this.calFloatEl;
    if (!w) return;
    const on = !!(this.calPanel && this.calPanel.collapsed);
    w.toggleClass("is-collapsed", on);
    if (on) {
      w.style.height = "46px";
    } else {
      const h = clamp((this.settings.calFloatRect && this.settings.calFloatRect.height) || 620, 320, 1100);
      w.style.height = h + "px";
    }
  }

  saveCalFloatRect(wrap) {
    if (!wrap) return;
    this.settings.calFloatRect = {
      left: parseFloat(wrap.style.left) || 0,
      top: parseFloat(wrap.style.top) || 0,
      width: wrap.offsetWidth,
      height: wrap.offsetHeight,
    };
    this.saveSettings();
  }

  /* 外观参数改了要立刻反映到已经开着的浮窗上 */
  applyCalFloatLook() {
    const w = this.calFloatEl;
    if (!w) return;
    const bg = this.settings.calFloatBg;
    if (bg) w.style.setProperty("--gd-cal-float-bg", bg);
    else w.style.removeProperty("--gd-cal-float-bg");
    w.style.setProperty("--gd-cal-float-op", String(clamp(this.settings.calFloatOpacity == null ? 0.96 : this.settings.calFloatOpacity, 0.4, 1)));
    w.style.setProperty("--gd-cal-float-blur", clamp(this.settings.calFloatBlur || 0, 0, 24) + "px");
    if (this.settings.calFloatShadow === false) w.addClass("is-no-shadow");
    else w.removeClass("is-no-shadow");
  }

  closeCalendarFloat() {
    if (this._calEsc) { window.removeEventListener("keydown", this._calEsc); this._calEsc = null; }
    if (this.calPanel) this.calPanel.close();
    if (this.calFloatEl) { this.calFloatEl.remove(); this.calFloatEl = null; }
  }

  toggleFloat() {
    if (!this.float.el) this.float.open(this.gridView() ? this.gridView().key : todayStr());
    else this.float.close();
  }
  /* 把 v1 残留的标签页改成 v3 类型，并去掉重复的目录 / 时间线标签。
   * 不直接改 workspace.json（Obsidian 正在运行时会把它覆盖回去），
   * 而是在启动完成后用官方 API 迁移，Obsidian 自己会把结果写回。 */
  async migrateLegacyViews() {
    for (const [oldType, newType] of Object.entries(LEGACY_VIEWS)) {
      let leaves = [];
      try { leaves = this.app.workspace.getLeavesOfType(oldType) || []; } catch (e) { continue; }
      for (const l of leaves) {
        try { await l.setViewState({ type: newType, active: false }); }
        catch (e) { /* 失效标签忽略：别名已注册，至少不会显示「插件不再活动」 */ }
      }
    }
    for (const type of [VIEW_SIDEBAR, VIEW_TIMELINE, VIEW_CALENDAR]) {
      const leaves = this.app.workspace.getLeavesOfType(type) || [];
      for (const l of leaves.slice(1)) { try { l.detach(); } catch (e) { /* ignore */ } }
    }
  }
  async applySidebar() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_SIDEBAR);
    if (!this.settings.showSidebar) {
      for (const l of leaves) l.detach();
      return;
    }
    for (const l of leaves.slice(1)) { try { l.detach(); } catch (e) { /* ignore */ } }
    await this.openSidebar(false);
  }
  async openSidebar(activate) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_SIDEBAR)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeftLeaf(false);
      if (!leaf) leaf = this.app.workspace.getLeftLeaf(true);
    }
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_SIDEBAR, active: activate === true });
    if (activate === true) this.app.workspace.revealLeaf(leaf);
  }
  /* ---------- 时间线面板登记（标签页 + 多个浮窗共用同一套渲染） ---------- */
  registerTimelinePanel(p) {
    if (!p) return;
    if (this.tlPanels.indexOf(p) < 0) this.tlPanels.push(p);
  }
  unregisterTimelinePanel(p) {
    const i = this.tlPanels.indexOf(p);
    if (i >= 0) this.tlPanels.splice(i, 1);
  }
  refreshAllTimelinePanels() {
    for (const p of this.tlPanels.slice()) {
      try { if (!p.dead) p.refresh(); } catch (e) { }
    }
  }

  /* ---------- 时间线浮窗（照搬日历浮窗：自绘 fixed 浮层，可拖可缩放，支持多开） ---------- */
  openTimelineFloat(initialKey) {
    if (IS_MOBILE) { new Notice("手机上请用标签页形式的时间线"); return null; }
    const panel = new TimelinePanel(this, { float: true });
    const wrap = document.createElement("div");
    wrap.addClass("gd-root");
    wrap.addClass("gd-tl-float");
    wrap.addClass("gd-theme-" + (this.settings.theme || "card"));

    const base = this.settings.tlFloatRect || {};
    const n = this.tlFloats.length;
    const w = clamp(base.width || 420, 280, 1200);
    const h = clamp(base.height || 620, 260, 1100);
    const vw = window.innerWidth, vh = window.innerHeight;
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    wrap.style.left = clamp((base.left != null ? base.left : vw - w - 60) - n * 26, 0, Math.max(0, vw - w)) + "px";
    wrap.style.top = clamp((base.top != null ? base.top : 90) + n * 26, 0, Math.max(0, vh - h)) + "px";

    /* 标题条 */
    const bar = wrap.createDiv({ cls: "gd-tl-float-bar" });
    bar.createSpan({ cls: "gd-tl-float-title", text: "时间线" });
    const btns = bar.createDiv({ cls: "gd-tl-float-btns" });
    const dup = btns.createEl("button", { cls: "gd-tl-float-btn", text: "＋", attr: { title: "再开一个时间线浮窗" } });
    dup.onclick = (e) => { e.stopPropagation(); this.openTimelineFloat(initialKey); };
    const pinch = btns.createEl("button", { cls: "gd-tl-float-btn", text: "▭", attr: { title: "回到默认大小" } });
    pinch.onclick = (e) => {
      e.stopPropagation();
      wrap.style.width = "420px";
      wrap.style.height = "620px";
      this.saveTlFloatRect(wrap);
    };
    const x = btns.createEl("button", { cls: "gd-tl-float-btn", text: "✕", attr: { title: "关闭这个时间线" } });
    x.onclick = (e) => { e.stopPropagation(); this.closeTimelineFloat(wrap); };

    /* 拖动 */
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      bar.setPointerCapture && bar.setPointerCapture(e.pointerId);
      wrap.addClass("is-dragging");
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      wrap.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - wrap.offsetWidth) + "px";
      wrap.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - wrap.offsetHeight) + "px";
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      wrap.removeClass("is-dragging");
      this.saveTlFloatRect(wrap);
    };
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);

    /* 内容 */
    const host = wrap.createDiv({ cls: "gd-tl-float-body" });
    panel.openInPane(host);
    if (initialKey) panel.setActive(initialKey);

    /* 右下角缩放柄 */
    const grip = wrap.createDiv({ cls: "gd-tl-grip", attr: { title: "拖动改大小" } });
    let rs = null;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const r = wrap.getBoundingClientRect();
      rs = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      grip.setPointerCapture && grip.setPointerCapture(e.pointerId);
      wrap.addClass("is-resizing");
    });
    grip.addEventListener("pointermove", (e) => {
      if (!rs) return;
      wrap.style.width = clamp(rs.w + (e.clientX - rs.x), 280, window.innerWidth) + "px";
      wrap.style.height = clamp(rs.h + (e.clientY - rs.y), 260, window.innerHeight) + "px";
    });
    const endRs = () => {
      if (!rs) return;
      rs = null;
      wrap.removeClass("is-resizing");
      this.saveTlFloatRect(wrap);
    };
    grip.addEventListener("pointerup", endRs);
    grip.addEventListener("pointercancel", endRs);

    document.body.appendChild(wrap);
    this.tlFloats.push(wrap);
    this.registerTimelinePanel(panel);
    panel._wrap = wrap;
    this.saveTlFloatRect(wrap);
    return panel;
  }

  saveTlFloatRect(wrap) {
    if (!wrap) return;
    this.settings.tlFloatRect = {
      left: parseInt(wrap.style.left, 10) || 0,
      top: parseInt(wrap.style.top, 10) || 0,
      width: wrap.offsetWidth || 420,
      height: wrap.offsetHeight || 620,
    };
    this.saveSettings();
  }

  closeTimelineFloat(wrap) {
    if (!wrap) return;
    const i = this.tlFloats.indexOf(wrap);
    const panel = this.tlPanels.find((p) => p._wrap === wrap);
    if (panel) { this.unregisterTimelinePanel(panel); try { panel.close(); } catch (e) { } }
    if (i >= 0) this.tlFloats.splice(i, 1);
    wrap.remove();
  }

  closeAllTimelineFloats() {
    for (const w of this.tlFloats.slice()) {
      try { this.closeTimelineFloat(w); } catch (e) { }
    }
    this.tlFloats = [];
  }

  toggleTimelineFloat() {
    if (this.tlFloats.length) this.closeAllTimelineFloats();
    else this.openTimelineFloat(this.timeline && this.timeline.panel ? this.timeline.panel.activeKey : "");
  }

  /* 流线图的宽度 + 方形开关：写到 body 上的 CSS 变量，标签页和浮窗一起生效 */
  applyTimeline() {
    try {
      const b = document.body;
      const w = clamp(Number(this.settings.timelineWidth) || 260, 180, 420);
      b.style.setProperty("--gd-tl-w", w + "px");
      b.classList.toggle("gd-tl-square", this.settings.timelineSquare !== false);
      b.classList.toggle("gd-tl-preview-above", this.settings.timelinePreviewAbove !== false);
    } catch (e) { /* 忽略 */ }
    try { this.refreshAllTimelinePanels(); } catch (e) { /* 忽略 */ }
  }

  async openTimeline() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TIMELINE)[0];
    if (!leaf) {
      const p = this.settings.timelinePlacement;
      if (p === "left") leaf = this.app.workspace.getLeftLeaf(false);
      else if (p === "tab") leaf = this.app.workspace.getLeaf(true);
      else leaf = this.app.workspace.getRightLeaf(false) || this.app.workspace.getRightLeaf(true);
    }
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TIMELINE, active: false });
  }

  /* ---- 批量封面：把 BatchCoverModal 打开（I-01 断点修复）----
   * 之前 05-view-grid.js 与 08-settings.js 都在调 openBatchCover()，
   * 但这里从来没定义过，点菜单直接 TypeError，看起来就是「功能没做」。 */
  /* 给某一天设封面：传 File 会先存进 attachments，传字符串则当库内路径 */
  async setCoverFor(key, fileOrPath, height) {
    if (!key) return;
    let path = "";
    if (typeof fileOrPath === "string") path = fileOrPath;
    else if (fileOrPath) {
      try {
        const folder = this.attachDir();
        await this.ensureFolder(folder);
        const safe = fileOrPath.name.replace(/[\\/:*?"<>|]/g, "_");
        let p2 = `${folder}/${safe}`;
        if (await this.app.vault.adapter.exists(p2)) p2 = `${folder}/${Date.now()}-${safe}`;
        const buf = await fileOrPath.arrayBuffer();
        await this.app.vault.adapter.writeBinary(p2, buf);
        path = p2;
      } catch (e) { new Notice("存图片失败：" + (e && e.message ? e.message : e)); return; }
    }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.rootFolder || "日记"}/${key}.md`));
    if (!(f instanceof TFile)) { new Notice("这天还没有日记"); return; }
    try {
      const raw = await this.app.vault.read(f);
      const parsed = parseDay(raw, this.settings.headingLevel);
      const lay = normalizeLayout(parsed.layout, this.settings);
      lay.cover = path;
      if (height) lay.coverHeight = clamp(height, 0, 320);
      lay.coverPos = "";
      const cells = normalizeCells(parsed.cells, lay, this.settings);
      const text = serializeDay(key, cells, {
        fm: parsed.fm, h1: parsed.h1, columns: lay.cols || this.settings.columns,
        level: this.settings.headingLevel, layout: lay,
      });
      await this.app.vault.modify(f, text);
      new Notice(path ? "封面已设好" : "封面已移除");
      this.refreshAll(true);
    } catch (e) { new Notice("设置封面失败：" + (e && e.message ? e.message : e)); }
  }
  /* 库内路径 / 网络地址 → 可直接放进 <img>.src 的地址 */
  /* 日历底图裁剪：框的宽高比按面板当前尺寸 */
  cropCalWall() {
    const s = this.settings;
    const p = s.calWallpaper || "";
    if (!p) { new Notice("还没有日历底图"); return; }
    const url = this.thumbUrl(p);
    if (!url) { new Notice("底图读不出来"); return; }
    const el = (this.calPanel && this.calPanel.el) || null;
    const w = (el && el.clientWidth) || 600;
    const h = (el && el.clientHeight) || 600;
    openCrop(this.app, {
      url,
      ratio: w / Math.max(h, 1),
      crop: s.calWallCrop || null,
      title: "裁剪日历底图",
      onOk: async (c) => {
        s.calWallCrop = c || null;
        await this.saveSettings();
        this.refreshCalendar();
        new Notice(c ? "底图已裁剪" : "底图恢复整张");
      },
    });
  }

  thumbUrl(src) {
    if (!src) return "";
    if (/^https?:/i.test(src)) return src;
    try {
      const f = this.app.metadataCache.getFirstLinkpathDest(normalizePath(src), "");
      return f ? this.app.vault.getResourcePath(f) : "";
    } catch (e) { return ""; }
  }

  /* ---- 日历底图：三个来源（电脑 / 库里 / 网络），都不依赖浮窗是否打开 ---- */
  async pickCalWallpaper(kind) {
    const s = this.settings;
    if (kind === "url") {
      new PromptModal(this.app, "用网络图片当底图", "图片地址（http/https 开头）", s.calWallpaper || "", async (v) => {
        const u = String(v || "").trim();
        if (!u) { new Notice("没有填地址"); return; }
        if (!/^https?:\/\//i.test(u)) { new Notice("要以 http:// 或 https:// 开头"); return; }
        s.calWallpaper = u;
        await this.saveSettings();
        this.refreshCalendar();
        new Notice("底图已换成网络图片");
      }).open();
      return;
    }
    if (kind === "vault") {
      const imgs = this.app.vault.getFiles().filter((f) => /^(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.extension));
      if (!imgs.length) { new Notice("库里还没有图片，先用「从电脑选…」传一张"); return; }
      const m = new Menu();
      for (const f of imgs.slice(-40).reverse()) {
        m.addItem((i) => i.setTitle(f.basename).setIcon("image").onClick(() => {
          const url = this.thumbUrl(f.path);
          if (!url) { new Notice("这张图读不出来"); return; }
          const el = (this.calPanel && this.calPanel.el) || null;
          const w = (el && el.clientWidth) || 600;
          const h = (el && el.clientHeight) || 600;
          openCrop(this.app, {
            url,
            ratio: w / Math.max(h, 1),
            crop: s.calWallCrop || null,
            title: "裁剪日历底图（框选完再保存）",
            onCancel: () => new Notice("没设底图"),
            onOk: async (crop) => {
              s.calWallpaper = f.path;
              s.calWallCrop = crop || null;
              await this.saveSettings();
              this.refreshCalendar();
              new Notice("底图已设好：" + f.basename);
            },
          });
        }));
      }
      const at = { clientX: window.innerWidth / 2 - 120, clientY: 160, preventDefault() { }, currentTarget: document.body };
      showMenuAt(m, at);
      return;
    }
    /* 默认：从电脑里选。先裁剪，再落盘（用户 2026-11-08 定的顺序） */
    const f = await chooseFileLike(this, { title: "选一张日历底图" });
    if (!f) { new Notice("没有选图"); return; }
    let tmp = "";
    try { tmp = URL.createObjectURL(new Blob([await f.arrayBuffer()])); }
    catch (e) { new Notice("这张图读不出来，换一张试试"); return; }
    const el = (this.calPanel && this.calPanel.el) || null;
    const w = (el && el.clientWidth) || 600;
    const h = (el && el.clientHeight) || 600;
    openCrop(this.app, {
      url: tmp,
      ratio: w / Math.max(h, 1),
      crop: s.calWallCrop || null,
      title: "裁剪日历底图（框选完再保存）",
      onCancel: () => { try { URL.revokeObjectURL(tmp); } catch (e) { } new Notice("没设底图"); },
      onOk: async (crop) => {
        try { URL.revokeObjectURL(tmp); } catch (e) { }
        try {
          const folder = this.attachDir();
          await this.ensureFolder(folder);
          const safe = String(f.name || "cover.png").replace(/[\\/:*?"<>|]/g, "_");
          let path = `${folder}/${safe}`;
          if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
          const buf = await f.arrayBuffer();
          await this.app.vault.adapter.writeBinary(path, buf);
          /* 写完立刻回读一次，确认文件真的在磁盘上（曾经出现过"设了但没生效"） */
          const okExist = await this.app.vault.adapter.exists(path);
          if (!okExist) { new Notice("图片写进去了但读不到：" + path); return; }
          s.calWallpaper = path;
          s.calWallCrop = crop || null;
          await this.saveSettings();
          this.refreshCalendar();
          new Notice("底图已设好：" + safe);
        } catch (e) {
          new Notice("设底图失败：" + (e && e.message ? e.message : e));
          console.error("[格间日记] pickCalWallpaper", e);
        }
      },
    });
  }

  /* 让所有在显示的日历（浮窗 / 标签页）立刻重画 */
  refreshCalendar() {
    try { if (this.calPanel && this.calPanel.el) { this.calPanel.buildIndex(); this.calPanel.render(); } } catch (e) { }
    try {
      const c = this.calendarInstance;
      if (c && c.panel && c.panel.el) { c.panel.buildIndex(); c.panel.render(); }
    } catch (e) { }
  }

  /* 给设置页用的缩略图（回执信息，避免"点了没反应"） */
  showCalWallPreview() {
    const p = this.settings.calWallpaper;
    if (!p) { new Notice("现在没有底图"); return; }
    new Notice("当前底图：" + p, 6000);
  }

  openBatchCover() {
    new BatchCoverModal(this.app, this).open();
  }

  /* ---- 批量皮肤 / 边框：逐篇改 layout 再写回 ----
   * skin 传空字符串表示只改边框，border 同理。days=0 表示全部。 */
  async applySkinToAll(skin, border, days, keys) {
    const cut = days > 0 ? shiftDate(todayStr(), -days) : "";
    const only = Array.isArray(keys) && keys.length ? new Set(keys) : null;
    let ok = 0, fail = 0;
    for (const f of this.dayFiles()) {
      const key = f.basename;
      if (only && !only.has(key)) continue;
      if (cut && splitDayKey(key).date < cut) continue;
      try {
        const raw = await this.app.vault.read(f);
        const parsed = parseDay(raw, this.settings.headingLevel);
        const lay = normalizeLayout(parsed.layout, this.settings);
        if (skin) lay.skin = skin;
        if (border) lay.border = border;
        const cells = normalizeCells(parsed.cells, parsed.layout, this.settings);
        const md = serializeDay(splitDayKey(key).date, cells, {
          fm: parsed.fm, h1: parsed.h1,
          columns: (parsed.layout && parsed.layout.cols) || this.settings.columns,
          level: this.settings.headingLevel,
          layout: lay,
        });
        await this.app.vault.modify(f, md);
        ok++;
      } catch (e) { fail++; }
    }
    new Notice(`已更新 ${ok} 篇的样式` + (fail ? `，${fail} 篇失败` : ""));
    this.refreshAll();
  }

  /* ══════════ 主题系统（v4）══════════ */

  /* 把每个项目自己的字体/格子变量写到它的根元素上。
     没填的项直接删掉变量，CSS 会自动回落到全局值（= 跟主题）。 */
  applyProjectVars() {
    const s = this.settings;
    const pv = s.projectVars || {};
    for (const [key, , sel] of PROJECT_KEYS) {
      const mine = pv[key] || {};
      const roots = document.querySelectorAll(sel);
      for (const el of roots) {
        for (const [k, cssVar] of PROJECT_VAR_KEYS) {
          const v = mine[k];
          if (v === undefined || v === null || v === "") el.style.removeProperty(cssVar);
          else if (k === "bgImage") {
            const u = this.thumbUrl(String(v));
            if (u) el.style.setProperty(cssVar, `url("${u}")`);
            else el.style.removeProperty(cssVar);
          } else {
            const num = (k === "fontSize" || k === "lineWidth" || k === "radius" || k === "gap" || k === "pad" || k === "cellOpacity");
            el.style.setProperty(cssVar, num ? String(v) + (k === "fontSize" || k === "radius" || k === "gap" || k === "pad" ? "px" : "") : String(v));
          }
        }
      }
    }
  }

  /* ══════════ 五处各自的背景（v3.14）══════════
   * 把主页/目录/日历/悬浮窗/流线图各一份的背景配置，写到各自的根元素上。
   * 没配的项一律删变量，CSS 自动回落到主题值。 */
  /* 某处背景「今天该长什么样」：把固定配置和换色节奏合到一起。
     以前只读 mode/image/texture/glass，完全不读 rhythm，
     所以用户「按日/按周/按月放了七张图」永远不生效——这就是那个 bug 的根。
     现在：节奏开了就用槽位里的（可能是纯色 / 图片 / 纹理），没开才用固定配置。 */
  resolveBgOf(cfg, dateStr) {
    const out = {
      mode: cfg.mode || "color",
      color: cfg.color || "",
      image: cfg.image || "",
      gradient: cfg.gradient || "",
      texture: cfg.texture || "none",
      video: cfg.video || "",
      fromRhythm: "",
    };
    if (!cfg.rhythm || cfg.rhythm === "off") return out;
    let slot = null;
    try { slot = bgSlotOf(cfg, dateStr); } catch (e) { slot = null; }
    if (!slot) return out;
    if (slot.kind === "image") {
      out.mode = "image"; out.image = slot.value; out.fromRhythm = "image";
    } else if (slot.kind === "texture") {
      out.mode = "texture"; out.texture = slot.value; out.fromRhythm = "texture";
    } else if (slot.kind === "color" && slot.value) {
      out.mode = "color"; out.color = slot.value; out.fromRhythm = "color";
    }
    return out;
  }

  /* 视频背景：CSS 背景放不了视频，得单独铺一层 <video> */
  applyProjectBgVideo(el, src, loop) {
    const old = el.querySelector(":scope > .gd-pbg-video");
    const u = src ? this.thumbUrl(String(src)) : "";
    if (!u) { if (old) old.remove(); return; }
    if (old && old.dataset.src === u) return;
    if (old) old.remove();
    if (IS_MOBILE) return;
    const v = document.createElement("video");
    v.className = "gd-pbg-video";
    v.dataset.src = u;
    v.src = u;
    v.autoplay = true;
    v.muted = true;
    v.loop = loop !== false;
    v.playsInline = true;
    el.insertBefore(v, el.firstChild);
  }

  /* 照片墙：只有主页有（用户：「照片墙只独属于主页」）。
     每张图各自有百分比坐标，能拖能四角缩放。 */
  applyProjectWall(el, cfg) {
    let wall = el.querySelector(":scope > .gd-pbg-wall");
    const w = cfg && cfg.wall;
    if (!w || !w.on || !Array.isArray(w.items) || !w.items.length) {
      if (wall) wall.remove();
      return;
    }
    if (!wall) {
      wall = document.createElement("div");
      wall.className = "gd-pbg-wall";
      el.insertBefore(wall, el.firstChild);
    }
    wall.empty();
    const n = w.unlimited ? w.items.length : Math.min(w.items.length, clamp(Number(w.limit) || 12, 1, 200));
    for (let i = 0; i < n; i++) {
      const it = w.items[i] || {};
      const d = wall.createDiv({ cls: "gd-pbg-photo" });
      const u = this.thumbUrl(String(it.src || ""));
      if (u) d.style.backgroundImage = 'url("' + u + '")';
      d.style.left = (Number(it.x) || 0) + "%";
      d.style.top = (Number(it.y) || 0) + "%";
      d.style.width = (Number(it.w) || 24) + "%";
      d.style.height = (Number(it.h) || 24) + "%";
      d.dataset.i = String(i);
    }
  }

  /* 把一处背景画到某个元素上（抽出来给「主页上区」复用） */
  paintBgOn(el, cfg, eff) {
    el.removeAttribute?.("data-pbg");
    el.removeAttribute?.("data-pbg-tex");
    el.style.removeProperty("--gd-pbg-image");
    el.style.removeProperty("--gd-pbg-color");
    el.style.removeProperty("--gd-pbg-blur");
    el.style.removeProperty("--gd-pbg-tint");

    const mode = eff.mode || "color";
    el.setAttr?.("data-pbg", mode);
    if (eff.fromRhythm) el.setAttr?.("data-pbg-rhythm", eff.fromRhythm);
    else el.removeAttribute?.("data-pbg-rhythm");

    if (mode === "color" && eff.color) el.style.setProperty("--gd-pbg-color", eff.color);
    if (mode === "gradient" && eff.gradient) el.style.setProperty("--gd-pbg-image", eff.gradient);
    if (mode === "image" && eff.image) {
      const u = this.thumbUrl(String(eff.image));
      if (u) el.style.setProperty("--gd-pbg-image", 'url("' + u + '")');
      /* 框选过的那一块：整块背景和「缩略图」都按用户选的位置和大小铺 */
      applyCrop(el, cfg.crop || null, "50% 50%");
    } else {
      el.style.backgroundSize = "";
      el.style.backgroundPosition = "";
      el.style.backgroundRepeat = "";
    }
    if (mode === "texture" && eff.texture && eff.texture !== "none") {
      el.setAttr?.("data-pbg-tex", eff.texture);
    }
    if (mode === "glass") {
      el.style.setProperty("--gd-pbg-blur", (Number(cfg.glass) || 12) + "px");
      if (cfg.glassTint) el.style.setProperty("--gd-pbg-tint", cfg.glassTint);
    }
    if (mode === "video") this.applyProjectBgVideo(el, eff.video, cfg.videoLoop);
    else this.applyProjectBgVideo(el, "", false);
  }

  applyProjectBg() {
    const s = this.settings;
    const today = todayStr();
    for (const [key, name, sel] of BG_PROJECTS) {
      const cfg = bgCfgOf(s, key);
      const eff = this.resolveBgOf(cfg, today);
      const roots = document.querySelectorAll(sel);
      for (const el of roots) {
        el.removeAttribute?.("data-cell-bg");
        el.style.removeProperty("--gd-cell-bg");
        el.style.removeProperty("--gd-cell-bg-image");
        el.style.removeProperty("--gd-cell-blur");

        /* 1.5：主页的「上区背景」跟「下区格子」拆成两块。
           以前整页底图铺在格子后面，格子的磨砂和底色都被它盖住。
           现在背景只画在上区（封面舞台 / 旧版封面），根元素自己透明，
           下面那块格子只吃自己的格子背景。 */
        if (key === "home") {
          el.setAttr?.("data-pbg", "transparent");
          el.removeAttribute?.("data-pbg-tex");
          el.style.removeProperty("--gd-pbg-image");
          el.style.removeProperty("--gd-pbg-color");
          el.style.removeProperty("--gd-pbg-blur");
          el.style.removeProperty("--gd-pbg-tint");
          el.addClass?.("gd-home-split");
          const tops = [];
          for (const sel2 of [".gd-cover-stage", ".gd-cover-wrap"]) {
            for (const t of document.querySelectorAll(sel2)) tops.push(t);
          }
          /* 照片墙不在这里画：它由舞台 GDStage 画在「第二层」上，
             那边每张照片能拖能四角缩放。这里再静态画一层就重复了。 */
          for (const t of tops) this.paintBgOn(t, cfg, eff);
          this.applyProjectBgVideo(el, "", false);
        } else {
          this.paintBgOn(el, cfg, eff);
        }

        /* 目录上下两块各自的磨砂（3.7）：互不影响，没开就没有 backdrop-filter 开销 */
        if (key === "dir") {
          el.toggleClass?.("gd-tree-glass-top", s.treeGlassTop === true);
          el.toggleClass?.("gd-tree-glass-bot", s.treeGlassBot === true);
        }

        /* 照片墙：主页的已经跟着背景搬到上区（见上面 key==="home" 分支），
           这里一律把根元素上的墙清掉，否则会在格子后面多铺一层。 */
        this.applyProjectWall(el, { wall: null });

        /* 格子背景 */
        const cm = cfg.cellMode || "follow";
        el.setAttr?.("data-cell-bg", cm);
        if (cm === "color" && cfg.cellColor) el.style.setProperty("--gd-cell-bg", cfg.cellColor);
        if (cm === "image" && cfg.cellImage) {
          const u2 = this.thumbUrl(String(cfg.cellImage));
          if (u2) el.style.setProperty("--gd-cell-bg-image", 'url("' + u2 + '")');
        }
        if (cm === "glass") el.style.setProperty("--gd-cell-blur", (Number(cfg.cellGlass) || 8) + "px");
      }
    }
  }

  /* 全部视图统一刷新视觉（套主题后调用） */
  applyAllTheme() {
    this.applyCustomCss();
    this.applyProjectVars();
    this.applyProjectBg();
    const g = this.gridView();
    if (g) { g.applyTheme(); g.render(); }
    if (this.sidebar) this.sidebar.render();
    if (this.timeline) this.timeline.refresh();
    this.refreshAllTimelinePanels();
    if (this.calPanel && this.calPanel.el) this.calPanel.render();
    const cal = this.calendarInstance;
    if (cal && cal.panel) cal.panel.render();
    if (this.float && this.float.el) this.float.refresh();
    this.applyProjectVars();
  }

  /* 从当前设置抓 tokens 存成主题 */
  async saveThemeAs(name, note) {
    const n = String(name || "").trim();
    if (!n) { new Notice("主题名不能为空"); return; }
    const tok = this.themes.grab();
    const saved = await this.themes.save(n, tok, note || "");
    this.settings.activeTheme = n;
    await this.saveSettings();
    new Notice("已保存主题「" + n + "」· 第 " + saved.version + " 版");
    return saved;
  }

  /* 覆盖当前主题 */
  async updateActiveTheme(note) {
    const n = this.settings.activeTheme;
    if (!n) { new Notice("先在主题菜单里选一个主题，或「存成新主题」"); return; }
    const tok = this.themes.grab();
    const saved = await this.themes.save(n, tok, note || "更新");
    new Notice("已更新「" + n + "」· 第 " + saved.version + " 版");
    return saved;
  }

  /* 主题菜单（顶栏 / 格子工具条 / 命令共用） */
  async showThemeMenu(evt) {
    const list = await this.themes.list();
    const menu = new Menu();
    const cur = this.settings.activeTheme || "";
    menu.addItem((i) => i.setTitle(cur ? "当前：" + cur : "当前：未套用主题（散项）")
      .setIcon("palette").setDisabled(true));
    menu.addSeparator();
    if (!list.length) {
      menu.addItem((i) => i.setTitle("还没有主题文件，点下面「存成新主题」")
        .setIcon("info").setDisabled(true));
    }
    for (const t of list) {
      menu.addItem((i) => i.setTitle((t.name === cur ? "✓ " : "") + t.name + "  (v" + t.version + ")")
        .setIcon(t.name === cur ? "check" : "circle")
        .onClick(async () => {
          await this.themes.apply(t.name);
          this.applyAllTheme();
        }));
    }
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("存成新主题…").setIcon("save").onClick(async () => {
      new PromptModal(this.app, "存成新主题", "主题名字", this.settings.activeTheme || "我的主题", async (v) => {
        await this.saveThemeAs(v, "从当前设置新建");
      }).open();
    }));
    menu.addItem((i) => i.setTitle("把当前改动存回主题").setIcon("save").onClick(async () => {
      new PromptModal(this.app, "更新主题", "这次改了什么（备注）", "", async (v) => {
        await this.updateActiveTheme(v);
      }).open();
    }));
    menu.addItem((i) => i.setTitle("版本历史 / 回滚…").setIcon("history").onClick(() => this.openThemeHistory()));
    menu.addItem((i) => i.setTitle("打开主题文件夹").setIcon("folder-open").onClick(async () => {
      await this.themes.ensureDir();
      const f = this.app.vault.getAbstractFileByPath(this.themes.dir);
      if (f) this.app.workspace.getLeaf(true).openFile(f.path);
      else new Notice("主题文件夹还没创建");
    }));
    if (evt) showMenuAt(menu, evt);
    else menu.showAtMouseEvent(new MouseEvent("click"));
  }

  /* 主题版本历史窗口 */
  openThemeHistory() {
    new ThemeHistoryModal(this.app, this).open();
  }

  /* 项目用到的视觉字段（切换项目时一起带走） */
  projectSkin() {
    const s = this.settings;
    return {
      theme: s.theme,
      skin: s.skin,
      defaultBorder: s.defaultBorder,
      accent: s.accent,
      bgMode: s.bgMode,
      bgColor: s.bgColor,
      bgGradient: s.bgGradient,
      bgImage: s.bgImage,
      bgTexture: s.bgTexture,
      bgRhythm: s.bgRhythm,
      bgByMonth: JSON.parse(JSON.stringify(s.bgByMonth || {})),
      bgByWeek: JSON.parse(JSON.stringify(s.bgByWeek || {})),
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontColor: s.fontColor,
      lineColor: s.lineColor,
      lineWidth: s.lineWidth,
      lineStyle: s.lineStyle,
      radius: s.radius,
      activeTheme: s.activeTheme,
    };
  }

  /* 切换项目：默认连视觉一起切（用户问「项目切换要不要连布局一起切」→ 做成可开关，默认开） */
  async switchProject(name) {
    if (!name) return;
    const s = this.settings;
    if (!s.projectLayouts || typeof s.projectLayouts !== "object") s.projectLayouts = {};
    const old = s.projectName || "日记";
    if (s.projectCarryLayout) {
      /* 先把旧项目现在的样子存下来 */
      s.projectLayouts[old] = this.projectSkin();
    }
    s.projectName = name;
    if (s.projectCarryLayout) {
      const snap = s.projectLayouts[name];
      if (snap) Object.assign(s, snap);
    }
    await this.saveSettings();
    this.applyAllTheme();
    this.refreshAll();
    new Notice("已切到项目：" + name + (s.projectCarryLayout ? "（视觉一起换）" : ""));
  }

  openSettings() {
    this.app.setting.open();
    this.app.setting.openTabById(PLUGIN_ID);
  }
  applyCustomCss() {
    let st = document.getElementById("gd-custom-css");
    if (!st) {
      st = document.createElement("style");
      st.id = "gd-custom-css";
      document.head.appendChild(st);
    }
    st.textContent = this.settings.customCss || "";
  }
  refreshAll(reloadFile) {
    if (this.calPanel && this.calPanel.el) this.calPanel.refresh();
    this.applyCustomCss();
    const g = this.gridView();
    if (g) {
      g.applyTheme();
      // 撤销 / 恢复快照后必须从磁盘重读，否则内存里的旧格子会再次覆盖回去
      if (reloadFile && g.file) g.reload();
      else g.render();
    }
    if (this.sidebar) this.sidebar.render();
    if (this.timeline) this.timeline.render();
    if (this.calendar) this.calendar.rebuild();
    if (this.float && this.float.el) this.float.render();
  }
}

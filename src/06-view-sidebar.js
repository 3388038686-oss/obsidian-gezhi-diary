/* ============ 左侧栏：日记目录 · 点击联动主视图 ============
 * 参照 ozntel/file-tree-alternative 的双面板形态：
 *   上半 = 文件夹树（可折叠、带数量徽标）
 *   下半 = 选中文件夹里的文件列表
 * 中间有一条可拖动的分隔条，比例会记住。
 * 日记视图（日期命名的 md）会带日历图标，点了直接进九宫格。
 * ========================================================== */

class SidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.keyword = "";
    this.activeKey = "";
    this.activeFolder = "";
    this.collapsed = new Set();
    this.summaryCache = new Map();
    this.collapsedMonth = new Set();
    this.renderDebounced = debounce(() => this.render(), 120);
  }
  getViewType() { return VIEW_SIDEBAR; }
  getDisplayText() { return "日记目录"; }
  getIcon() { return ICON_SIDEBAR; }

  async onOpen() { this.build(); await this.render(); }

  build() {
    const el = this.contentEl;
    el.empty();
    el.addClass("gd-root"); el.addClass("gd-sidebar-root");
    if (IS_MOBILE) el.addClass("is-mobile");
    el.toggleClass("gd-glow", this.plugin.settings.hoverGlow !== false);
    el.toggleClass("gd-tree-lines", this.plugin.settings.showTreeLines !== false);

    /* 顶部：默认只留搜索框（用户要求「顶部瘦身」），标题与按钮收进一个 ⋯ 菜单 */
    el.toggleClass("is-slimtop", this.plugin.settings.treeSlimTop !== false);
    if (this.plugin.settings.treeSlimTop === false) {
      const top = el.createDiv({ cls: "gd-side-top" });
      const title = top.createDiv({ cls: "gd-side-title" });
      title.createSpan({ text: "格间日记" });
      title.createEl("small", { text: "目录" });
      const acts = top.createDiv({ cls: "gd-side-acts" });
      const mkBtn = (text, tip, fn) => {
        const b = acts.createEl("button", { text, cls: "gd-tbtn", attr: { title: tip, "aria-label": tip } });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
      };
      mkBtn("今天", "打开今天的日记", () => this.plugin.openDay(todayStr()));
      mkBtn("＋", "在这一天再写一篇", () => this.plugin.newEntryFor(todayStr()));
      mkBtn("⟳", "刷新目录", () => this.render());
    }

    /* 搜索 */
    const searchRow = el.createDiv({ cls: "gd-side-search" });
    this.searchInput = searchRow.createEl("input", {
      cls: "gd-side-search-input",
      attr: { placeholder: "搜索日期 / 内容 / 文件名…", type: "search" },
    });
    this.searchInput.addEventListener("input", () => {
      this.keyword = this.searchInput.value.trim();
      this.renderDebounced();
    });
    /* 用户要求：目录左上角的「⋯」删掉，功能重复（下面「文件夹」那行已经有菜单了） */

    /* 双面板：上文件夹 / 下文件 */
    if (this.plugin.settings.treeTwoPane !== false) {
      /* 功能区：一排常驻图标单独占一行，放在文件夹上面（用户 3.2）；
         「隐藏这个文件夹」再单独一栏，紧跟其后。两者都在面板外，
         这样即使把文件夹区域整块收起来，也还有地方点回来。 */
      this.topToolsEl = el.createDiv({ cls: "gd-tree-toptools" });
      this.toolbarEl = this.topToolsEl.createDiv({ cls: "gd-tree-toolbar" });
      this.hideBarEl = this.topToolsEl.createDiv({ cls: "gd-tree-hidebar" });
      this.body = el.createDiv({ cls: "gd-split" });
      /* 「显示 / 隐藏文件夹区域」：关掉时上半块整个收起来，文件区占满 */
      const showTop = this.plugin.settings.treeShowFolderPane !== false;
      this.body.toggleClass("is-notree", !showTop);
      this.folderPane = this.body.createDiv({ cls: "gd-split-top" });
      this.splitter = this.body.createDiv({ cls: "gd-split-bar", attr: { title: "拖动调整上下比例" } });
      this.filePane = this.body.createDiv({ cls: "gd-split-bot" });
      this.folderListEl = this.folderPane.createDiv({ cls: "gd-tree-folders" });
      this.fileListEl = this.filePane.createDiv({ cls: "gd-tree-files" });
      this.applySplit(this.plugin.settings.treePaneRatio || 0.42);
      this.bindSplitter();
      if (!showTop) { this.folderPane.style.display = "none"; this.splitter.style.display = "none"; }
    } else {
      this.fileListEl = el.createDiv({ cls: "gd-side-list" });
    }

    /* 底部（默认隐藏，可在设置里打开） */
    if (this.plugin.settings.treeShowFoot) {
      const foot = el.createDiv({ cls: "gd-side-foot" });
      foot.createEl("button", { text: "时间线 / 版本历史", cls: "gd-side-link" }).onclick = () => this.plugin.openTimeline();
      foot.createEl("button", { text: "日历", cls: "gd-side-link" }).onclick = () => this.plugin.openCalendar();
      foot.createEl("button", { text: "设置", cls: "gd-side-link" }).onclick = () => this.plugin.openSettings();
    }
  }

  applySplit(ratio) {
    if (!this.folderPane) return;
    const r = clamp(ratio, 0.15, 0.85);
    this.folderPane.style.flex = `0 0 ${(r * 100).toFixed(1)}%`;
    this.filePane.style.flex = "1 1 auto";
  }

  bindSplitter() {
    let dragging = false;
    const down = (ev) => { dragging = true; this.splitter.addClass("is-dragging"); ev.preventDefault(); };
    const move = (ev) => {
      if (!dragging || !this.body) return;
      const rect = this.body.getBoundingClientRect();
      const r = clamp((ev.clientY - rect.top) / Math.max(rect.height, 1), 0.15, 0.85);
      this.applySplit(r);
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      this.splitter.removeClass("is-dragging");
      const rect = this.body.getBoundingClientRect();
      const r = clamp((this.folderPane.getBoundingClientRect().height / Math.max(rect.height, 1)), 0.15, 0.85);
      this.plugin.settings.treePaneRatio = r;
      this.plugin.saveSettings();
    };
    this.splitter.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  setActive(key) {
    this.activeKey = key;
    if (!this.fileListEl) return;
    for (const row of this.fileListEl.querySelectorAll(".gd-tree-file")) {
      row.toggleClass("is-active", row.dataset.key === key);
    }
  }

  /* ---------- 数据：把 vault 拆成「文件夹树」+「文件清单」 ---------- */
  collect() {
    const root = normalizePath(this.plugin.settings.rootFolder || "日记");
    const s = this.plugin.settings;
    const all = this.app.vault.getFiles().filter((f) => {
      if (f.path.includes("/.")) return false;
      if (f.extension !== "md") return false;
      if (f.path.startsWith(root + "/")) return true;
      /* 其他文件夹里的 md 也能看（开关控制），但不含附件目录 */
      return !!s.treeShowOtherFiles;
    });
    const folders = new Map();     // 文件夹路径（相对 root）→ 文件数（含子孙）
    let rootTotal = 0;
    for (const f of all) {
      const inRoot = f.path.startsWith(root + "/");
      /* 不在日记目录下的文件，用它自己的完整路径当相对路径；
         以前一律按 root.length+1 去切，会把 AI模型资料/_素材 切成「_素材」。 */
      const rel = inRoot ? f.path.slice(root.length + 1) : f.path;
      const dirs = rel.split("/").slice(0, -1);
      if (inRoot) rootTotal++;
      let acc = "";
      for (const p of dirs) {
        acc = acc ? acc + "/" + p : p;
        folders.set(acc, (folders.get(acc) || 0) + 1);
      }
    }
    folders.set("", rootTotal);
    return { root, all, folders };
  }

  async render() {
    if (this.plugin.settings.treeTwoPane !== false) this.renderFolders();
    await this.renderFiles();
  }

  /* ---------- 文件夹：标题本身就是菜单 ---------- */
  folderHeadMenu(evt) {
    const s = this.plugin.settings;
    const m = new Menu();
    const tick = (on) => (on ? "✓ " : "");

    /* 排序 */
    m.addItem((i) => i.setTitle("排序").setIcon("arrow-up-down").setDisabled(true));
    for (const [v, n] of [["date-desc", "日期 ↓"], ["date-asc", "日期 ↑"], ["name-asc", "名称 A→Z"], ["name-desc", "名称 Z→A"], ["mtime-desc", "最近改过"]]) {
      m.addItem((i) => i.setTitle("　" + tick(s.treeSortMode === v) + n).onClick(async () => {
        s.treeSortMode = v; await this.plugin.saveSettings(); this.render();
      }));
    }
    m.addSeparator();

    /* 只看 */
    m.addItem((i) => i.setTitle("只看").setIcon("filter").setDisabled(true));
    for (const [v, n] of [["all", "全部"], ["daily", "只看日记"], ["other", "只看其它文件"], ["fav", "只看收藏"]]) {
      m.addItem((i) => i.setTitle("　" + tick(s.treeFilterMode === v) + n).onClick(async () => {
        s.treeFilterMode = v; await this.plugin.saveSettings(); this.render();
      }));
    }
    m.addSeparator();

    /* 分组 */
    m.addItem((i) => i.setTitle("分组").setIcon("layout-list").setDisabled(true));
    for (const [v, n] of [["smart", "今天 / 昨天 / 前七天 / 更早"], ["month", "按月"], ["none", "不分组"]]) {
      m.addItem((i) => i.setTitle("　" + tick((s.treeGroupMode || "smart") === v) + n).onClick(async () => {
        s.treeGroupMode = v; await this.plugin.saveSettings(); this.render();
      }));
    }
    m.addSeparator();

    /* 显示 */
    m.addItem((i) => i.setTitle(tick(s.treeCompact) + "紧凑模式（一行一个）").setIcon("align-justify").onClick(async () => {
      s.treeCompact = !s.treeCompact; await this.plugin.saveSettings(); this.build(); this.render();
    }));
    m.addItem((i) => i.setTitle(tick(s.treeThumb !== false) + "显示封面缩略图").setIcon("image").onClick(async () => {
      s.treeThumb = s.treeThumb === false; await this.plugin.saveSettings(); this.render();
    }));
    m.addItem((i) => i.setTitle(tick(s.treeShowStats !== false) + "显示篇数和字数").setIcon("hash").onClick(async () => {
      s.treeShowStats = s.treeShowStats === false; await this.plugin.saveSettings(); this.render();
    }));
    m.addSeparator();

    /* 文件夹操作 */
    m.addItem((i) => i.setTitle("展开全部文件夹").setIcon("chevrons-down").onClick(() => { this.collapsed.clear(); this.renderFolders(); }));
    m.addItem((i) => i.setTitle("折叠全部文件夹").setIcon("chevrons-up").onClick(() => {
      for (const k of this.collect().folders.keys()) this.collapsed.add(k);
      this.renderFolders();
    }));
    m.addItem((i) => i.setTitle(s.treeShowHidden ? "收起被隐藏的文件夹" : "显示被隐藏的文件夹").setIcon("eye").onClick(async () => {
      s.treeShowHidden = !s.treeShowHidden; await this.plugin.saveSettings(); this.renderFolders();
    }));
    m.addItem((i) => i.setTitle("新建文件夹…").setIcon("folder-plus").onClick(() => {
      new PromptModal(this.app, "新建文件夹", "在「" + (this.activeFolder || "日记") + "」下面建一个子文件夹", "", async (v) => {
        const name = String(v || "").trim().replace(/[\\/:*?"<>|]/g, "_");
        if (!name) return;
        const root = normalizePath(this.plugin.settings.rootFolder || "日记");
        const base = this.activeFolder ? root + "/" + this.activeFolder : root;
        try {
          await this.app.vault.createFolder(normalizePath(base + "/" + name));
          new Notice("已建好文件夹");
          this.renderFolders();
        } catch (e) { new Notice("建文件夹失败：" + (e && e.message ? e.message : e)); }
      }).open();
    }));
    m.addSeparator();

    m.addItem((i) => i.setTitle("打开今天的日记").setIcon("calendar-check").onClick(() => this.plugin.openDay(todayStr())));
    m.addItem((i) => i.setTitle("刷新目录").setIcon("refresh-cw").onClick(() => this.render()));
    showMenuAt(m, evt);
  }

  /* ══════════ 图标工具栏（v3.21）══════════
     用户参考官方文件树：新建文件夹 / 排序 / 显示隐藏 / 外观 / 移动模式。
     全部常驻显示，不再藏进右键菜单。 */
  renderToolbar() {
    const el = this.toolbarEl;
    if (!el) return;
    el.empty();
    const s = this.plugin.settings;
    const mk = (icon, tip, fn, on) => {
      const b = el.createEl("button", { cls: "gd-tree-tool" + (on ? " is-on" : ""), attr: { title: tip, "aria-label": tip } });
      try { setIcon(b, icon); } catch (e) { b.setText(tip.slice(0, 1)); }
      b.onclick = (e) => { e.stopPropagation(); fn(e); };
      return b;
    };

    /* 新建文件夹 */
    mk("folder-plus", "新建文件夹", () => {
      new PromptModal(this.app, "新建文件夹", "在「" + (this.activeFolder || "日记") + "」下面建一个子文件夹", "", async (v) => {
        const name = String(v || "").trim().replace(/[\\/:*?"<>|]/g, "_");
        if (!name) return;
        const root = normalizePath(this.plugin.settings.rootFolder || "日记");
        const base = this.activeFolder ? root + "/" + this.activeFolder : root;
        try {
          await this.app.vault.createFolder(normalizePath(base + "/" + name));
          new Notice("已建好文件夹");
          this.renderFolders();
        } catch (e) { new Notice("建文件夹失败：" + (e && e.message ? e.message : e)); }
      }).open();
    });

    /* 排序 */
    mk("arrow-up-down", "排序", (e) => {
      const m = new Menu();
      for (const [v, n] of [["date-desc", "日期 ↓"], ["date-asc", "日期 ↑"], ["name-asc", "名称 A→Z"], ["name-desc", "名称 Z→A"], ["mtime-desc", "最近改过"]]) {
        m.addItem((i) => i.setTitle(((s.treeSortMode || "date-desc") === v ? "✓ " : "") + n).onClick(async () => {
          s.treeSortMode = v; await this.plugin.saveSettings(); this.render();
        }));
      }
      showMenuAt(m, e);
    });

    /* 显示 / 隐藏整个文件夹区域（用户列的功能条第三项） */
    mk(s.treeShowFolderPane === false ? "eye-off" : "eye", s.treeShowFolderPane === false ? "显示文件夹区域" : "隐藏文件夹区域", async () => {
      s.treeShowFolderPane = s.treeShowFolderPane === false ? true : false;
      await this.plugin.saveSettings();
      this.build();
      this.render();
    }, s.treeShowFolderPane !== false);

    /* 外观 */
    mk("palette", "外观", (e) => this.folderHeadMenu(e));

    /* 移动模式：点一下进入，再点一下退出（用户要求） */
    mk("grip-vertical", this.moveMode ? "退出移动模式" : "移动模式（拖动文件夹换顺序）", () => this.toggleMoveMode(), !!this.moveMode);

    /* 隐藏这个文件夹（单独一栏，放在文件夹区域上面） */
    const hb = this.hideBarEl;
    if (hb) {
      hb.empty();
      hb.toggleClass("is-hidden", !this.activeFolder);
      if (this.activeFolder) {
        const b = hb.createEl("button", { cls: "gd-tree-tool gd-tree-hide", attr: { title: "隐藏这个文件夹：" + this.activeFolder } });
        try { setIcon(b, "folder-minus"); } catch (e) { b.setText("隐藏"); }
        b.createSpan({ text: "隐藏这个文件夹" });
        b.onclick = async (e) => {
          e.stopPropagation();
          const arr = Array.isArray(s.treeHiddenFolders) ? s.treeHiddenFolders.slice() : [];
          if (!arr.includes(this.activeFolder)) arr.push(this.activeFolder);
          s.treeHiddenFolders = arr;
          await this.plugin.saveSettings();
          this.activeFolder = "";
          this.renderFolders();
          new Notice("已隐藏");
        };
      }
    }
  }

  /* 移动模式：进/出都点同一个图标 */
  toggleMoveMode() {
    this.moveMode = !this.moveMode;
    this.renderFolders();
    if (this.moveMode) new Notice("移动模式：拖动文件夹换顺序，再点一次图标退出");
  }

  /* 文件夹图标元素：内置图标 / 表情 / 缩略图（每个文件夹各一张，库里选或粘网址） */
  folderIconEl(parent, st, key) {
    const s = this.plugin.settings;
    const st2 = st || {};
    const box = parent.createSpan({ cls: "gd-tree-icon" });
    if (st2.img) {
      /* 目录第二层「缩略图」：每个文件夹各一张，当图标用，不能拖不能缩。
         用户定案（问题 1）：每个文件各一张。 */
      box.addClass("is-img");
      const u = /^https?:\/\//i.test(st2.img) ? st2.img : (this.plugin.thumbUrl ? this.plugin.thumbUrl(st2.img) : "");
      if (u) box.style.backgroundImage = 'url("' + u + '")';
      return box;
    }
    if (st2.emoji) { box.addClass("is-emoji"); box.setText(st2.emoji); return box; }
    if (st2.icon) { try { setIcon(box, st2.icon); } catch (e) { box.addClass("is-dot"); } return box; }
    /* 没单独设过：按全局图标样式画 */
    this.paintTreeIcon(box, false, null);
    return box;
  }

  /* 文件夹排序：先按手动顺序，其余按名字 */
  orderFolders(keys) {
    const order = Array.isArray(this.plugin.settings.treeFolderOrder) ? this.plugin.settings.treeFolderOrder : [];
    return keys.slice().sort((a, b) => {
      if (a === "") return -1;
      if (b === "") return 1;
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, "zh");
    });
  }

  folderStyle(key) {
    const all = this.plugin.settings.treeFolderStyles || {};
    return all[key] || null;
  }

  renderFolders() {
    const el = this.folderListEl;
    if (!el) return;
    el.empty();
    const s = this.plugin.settings;
    const { root, all, folders } = this.collect();
    const kw = this.keyword.toLowerCase();
    const hidden = new Set(Array.isArray(s.treeHiddenFolders) ? s.treeHiddenFolders : []);
    const showHidden = !!s.treeShowHidden;

    /* 图标工具栏：常驻一排，放在文件夹上面（用户参考官方文件树顶部那排） */
    this.renderToolbar();

    /* 标题就是菜单入口 */
    const head = el.createDiv({ cls: "gd-tree-head gd-tree-headbtn" });
    head.createSpan({ text: "文件夹" });
    head.createSpan({ text: String([...folders.keys()].filter((k) => k !== "").length), cls: "gd-side-count" });
    head.createSpan({ cls: "gd-tree-headmore", text: "⋯" });
    head.setAttribute("title", "点这里：排序 / 只看 / 分组 / 显示 / 新建文件夹");
    head.onclick = (e) => { e.stopPropagation(); this.folderHeadMenu(e); };

    let keys = this.orderFolders([...folders.keys()]);

    for (const key of keys) {
      if (key !== "" && hidden.has(key) && !showHidden) continue;
      const depth = key ? key.split("/").length : 0;
      const name = key ? key.split("/").pop() : root.split("/").pop() || "日记";
      const isOpen = !this.collapsed.has(key);
      const st = this.folderStyle(key);
      const row = el.createDiv({ cls: "gd-tree-folder" + (key === this.activeFolder ? " is-active" : "") + (hidden.has(key) ? " is-hiddenfolder" : "") });
      row.style.paddingLeft = 6 + depth * 12 + "px";
      row.dataset.folder = key;
      if (st && st.color) row.style.setProperty("--gd-tree-folder-color", st.color);

      this.sepInto(el, "folder:" + key);
      /* 三角与圆点二选一（用户：「点点与下标箭头是二选一」），选哪个哪个能点折叠 */
      const markMode = s.treeMarkMode || "caret";
      if (markMode === "caret") {
        row.createSpan({ cls: "gd-tree-caret", text: isOpen ? "▾" : "▸" });
      } else {
        const dot = row.createSpan({ cls: "gd-tree-dot" + (isOpen ? " is-open" : "") });
        dot.onclick = (e) => {
          e.stopPropagation();
          if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key);
          this.renderFolders();
        };
      }
      this.folderIconEl(row, st, key);
      row.createSpan({ text: name, cls: "gd-tree-name" });
      if (s.treeShowBadge !== false) {
        const n = folders.get(key) || 0;
        if (n) row.createSpan({ text: String(n), cls: "gd-side-count" });
      }

      const caret = row.querySelector(".gd-tree-caret");
      if (caret) caret.onclick = (e) => {
        e.stopPropagation();
        if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key);
        this.renderFolders();
      };
      row.onclick = () => {
        this.activeFolder = key;
        this.renderFolders();
        this.renderFiles();
      };
      row.addEventListener("contextmenu", (e) => this.folderMenu(e, key));
      this.bindDropTarget(row, key);
      if (this.moveMode && key) this.bindFolderDrag(row, key);

      /* 子文件夹 */
      if (isOpen) {
        const direct = [...folders.keys()].filter((k) => {
          if (!k || k === key) return false;
          const q = key ? key.split("/") : [];
          const p = k.split("/");
          if (p.length !== q.length + 1) return false;
          return q.every((seg, i) => seg === p[i]);
        });
        for (const ck of this.orderFolders(direct.sort((x, y) => x.localeCompare(y, "zh")))) {
          if (hidden.has(ck) && !showHidden) continue;
          const cn = ck.split("/").pop();
          const cst = this.folderStyle(ck);
          const crow = el.createDiv({ cls: "gd-tree-folder is-child" + (ck === this.activeFolder ? " is-active" : "") + (hidden.has(ck) ? " is-hiddenfolder" : "") });
          crow.style.paddingLeft = 6 + (depth + 1) * 12 + "px";
          crow.dataset.folder = ck;
          if (cst && cst.color) crow.style.setProperty("--gd-tree-folder-color", cst.color);
          const mm = s.treeMarkMode || "caret";
          if (mm === "caret") {
            crow.createSpan({ cls: "gd-tree-caret", text: this.collapsed.has(ck) ? "▸" : "▾" });
          } else {
            const cdot = crow.createSpan({ cls: "gd-tree-dot" + (this.collapsed.has(ck) ? "" : " is-open") });
            cdot.onclick = (e) => {
              e.stopPropagation();
              if (this.collapsed.has(ck)) this.collapsed.delete(ck); else this.collapsed.add(ck);
              this.renderFolders();
            };
          }
          this.folderIconEl(crow, cst, ck);
          crow.createSpan({ text: cn, cls: "gd-tree-name" });
          const n = folders.get(ck) || 0;
          if (n) crow.createSpan({ text: String(n), cls: "gd-side-count" });
          crow.onclick = (e) => {
            e.stopPropagation();
            this.activeFolder = ck;
            this.renderFolders();
            this.renderFiles();
          };
          crow.addEventListener("contextmenu", (e) => this.folderMenu(e, ck));
          this.bindDropTarget(crow, ck);
          if (this.moveMode) this.bindFolderDrag(crow, ck);
        }
      }
      if (kw && !name.toLowerCase().includes(kw)) row.addClass("is-dim");
    }
  }

  async renderFiles() {
    const el = this.fileListEl;
    if (!el) return;
    el.empty();
    const s = this.plugin.settings;
    el.toggleClass("is-compact", !!s.treeCompact);
    const { root, all } = this.collect();
    const folder = this.activeFolder || "";
    const kw = this.keyword.toLowerCase();

    let files = all.filter((f) => {
      const inRoot = f.path.startsWith(root + "/");
      const rel = inRoot ? f.path.slice(root.length + 1) : f.path;
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      return folder ? dir === folder || dir.startsWith(folder + "/") : true;
    });

    if (kw) {
      const picked = [];
      for (const f of files) {
        let hit = f.basename.toLowerCase().includes(kw);
        if (!hit) hit = (await this.summary(f)).text.toLowerCase().includes(kw);
        if (hit) picked.push(f);
      }
      files = picked;
    }

    const fm = s.treeFilterMode || "all";
    const favSet = new Set(Array.isArray(s.favoriteFiles) ? s.favoriteFiles : []);
    if (fm === "daily") files = files.filter((f) => DATE_RE.test(f.name));
    else if (fm === "other") files = files.filter((f) => !DATE_RE.test(f.name));
    else if (fm === "fav") files = files.filter((f) => favSet.has(f.path));

    const sm = s.treeSortMode || "date-desc";
    const byName = (a, b) => a.basename.localeCompare(b.basename, "zh");
    const byDate = (a, b) => {
      const da = splitDayKey(a.basename), db = splitDayKey(b.basename);
      if (da.date !== db.date) return db.date.localeCompare(da.date);
      const va = cnValue(da.suffix), vb = cnValue(db.suffix);
      return (Number.isFinite(va) ? va : 999) - (Number.isFinite(vb) ? vb : 999);
    };
    if (sm === "date-asc") files.sort((a, b) => -byDate(a, b));
    else if (sm === "name-asc") files.sort(byName);
    else if (sm === "name-desc") files.sort((a, b) => -byName(a, b));
    else if (sm === "mtime-desc") files.sort((a, b) => (b.stat ? b.stat.mtime : 0) - (a.stat ? a.stat.mtime : 0));
    else files.sort(byDate);

    /* 标题行：文件夹名 + 篇数 */
    const head = el.createDiv({ cls: "gd-tree-head" });
    head.createSpan({ text: folder ? folder.split("/").pop() : "全部日记" });
    head.createSpan({ text: String(files.length) + " 篇", cls: "gd-side-count" });

    if (!files.length) {
      el.createDiv({ cls: "gd-empty", text: kw ? "没有匹配的笔记" : "这个文件夹里还没有笔记" });
      return;
    }

    const gm = s.treeGroupMode || "smart";

    if (gm === "none") {
      for (const f of files) await this.renderFileRow2(f, el);
      return;
    }

    /* 分桶 */
    const buckets = new Map();
    const today = todayStr();
    const yest = shiftDate(today, -1);
    const weekAgo = shiftDate(today, -7);
    for (const f of files) {
      const d = splitDayKey(f.basename).date || "";
      let bk;
      if (gm === "month") bk = d ? d.slice(0, 7) : "其他";
      else {
        if (!d) bk = "其他";
        else if (d === today) bk = "今天";
        else if (d === yest) bk = "昨天";
        else if (d > weekAgo) bk = "前七天";
        else bk = "更早";
      }
      if (!buckets.has(bk)) buckets.set(bk, []);
      buckets.get(bk).push(f);
    }

    const SMART_ORDER = ["今天", "昨天", "前七天", "更早", "其他"];
    const list = gm === "month"
      ? [...buckets.keys()].sort((a, b) => b.localeCompare(a))
      : SMART_ORDER.filter((k) => buckets.has(k));

    for (const bk of list) {
      const items = buckets.get(bk);
      const shut = this.collapsedMonth.has(bk);
      const gh = el.createDiv({ cls: "gd-tree-group gd-tree-month" + (shut ? " is-shut" : "") });
      gh.createSpan({ cls: "gd-tree-caret", text: shut ? "▸" : "▾" });
      gh.createSpan({ text: gm === "month" && bk !== "其他" ? bk.replace("-", " 年 ") + " 月" : bk });
      gh.createSpan({ text: String(items.length), cls: "gd-side-count" });
      gh.onclick = () => {
        if (this.collapsedMonth.has(bk)) this.collapsedMonth.delete(bk); else this.collapsedMonth.add(bk);
        this.renderFiles();
      };
      if (shut) continue;
      for (const f of items) await this.renderFileRow2(f, el);
    }
  }

  async renderFileRow2(file, parent) {
    const key = file.basename;
    const isDaily = DATE_RE.test(file.name);
    const { suffix } = splitDayKey(key);
    const s = this.plugin.settings;
    const favs = Array.isArray(s.favoriteFiles) ? s.favoriteFiles : [];
    const isFav = favs.includes(file.path);
    const row = parent.createDiv({ cls: "gd-tree-file" + (key === this.activeKey ? " is-active" : "") + (isFav ? " is-fav" : "") });
    row.dataset.key = key;

    /* 封面缩略图（用户要的「封面缩略图」） */
    const info = await this.summary(file);
    const showThumb = s.treeThumb !== false && !s.treeCompact;
    if (showThumb) {
      /* 小图钉：一个空格宽的方块，有图用图，没图用强调色 */
      const th = row.createDiv({ cls: "gd-tree-thumb" });
      const url = info.img ? this.plugin.thumbUrl(info.img) : "";
      if (url) th.style.backgroundImage = 'url("' + url + '")';
      else th.addClass("is-empty");
    } else {
      /* 没图钉的时候才出小圆点，两者不重复 */
      const icon = row.createSpan({ cls: "gd-tree-icon" });
      this.paintTreeIcon(icon, isDaily, null);
    }

    const main = row.createDiv({ cls: "gd-tree-file-main" });
    const name = isDaily ? dateShort(key) + (suffix ? " · 第 " + suffix + " 篇" : "") : file.basename;
    const nameEl = main.createDiv({ cls: "gd-tree-file-name", text: name });
    nameEl.setAttribute("title", name);
    if (s.treeCompact) {
      if (s.treeShowStats !== false) row.createSpan({ cls: "gd-tree-wd", text: weekdayCN(key) });
    } else {
      const sub = main.createDiv({ cls: "gd-tree-file-sub", text: info.text });
      sub.setAttribute("title", info.text);
    }
    if (!s.treeCompact && s.treeShowStats !== false) {
      const bits = [];
      if (isDaily) bits.push(weekdayCN(key));
      if (info.words) bits.push(info.words + " 字");
      if (bits.length) row.createSpan({ cls: "gd-tree-wd", text: bits.join(" · ") });
    }
    if (s.treeDragMove !== false) this.bindDragRow(row, file);

    row.onclick = () => {
      if (isDaily) this.plugin.openDay(key); else this.app.workspace.getLeaf(true).openFile(file);
    };
    row.addEventListener("contextmenu", (e) => this.showItemMenu(e, file));
  }

  /* ---------- 图标：默认干净（文件夹可自定义 emoji / 图标） ---------- */
  /* 图标：先看这个文件夹自己设过什么，再看全局「图标样式」。
     注意 treeIconStyle 以前是死字段（设置了没人读），这里真的接上。 */
  paintTreeIcon(icon, isDaily, st) {
    icon.className = "gd-tree-icon";
    icon.empty();
    if (st && st.emoji) { icon.addClass("is-emoji"); icon.setText(st.emoji); return; }
    if (st && st.icon) { setIcon(icon, st.icon); return; }
    if (st && st.img) {
      icon.addClass("is-img");
      const u = /^https?:\/\//i.test(st.img) ? st.img : (this.plugin.thumbUrl ? this.plugin.thumbUrl(st.img) : "");
      if (u) icon.style.backgroundImage = 'url("' + u + '")';
      return;
    }
    const style = this.plugin.settings.treeIconStyle || "dot";
    const daily = isDaily ? "gd-tree-icon is-daily" : "gd-tree-icon";
    if (style === "none") return;
    if (style === "emoji") { icon.addClass("is-emoji"); icon.setText(isDaily ? "📔" : "📁"); return; }
    if (style === "icon") {
      try { setIcon(icon, isDaily ? "calendar-days" : "folder"); } catch (e) { icon.addClass("is-dot"); }
      return;
    }
    icon.addClass("is-" + style);
  }

  /* ---------- 分隔符：线体或图（A3） ---------- */
  sepInto(parent, key) {
    const st = this.plugin.settings.treeSepStyle || "none";
    if (st === "none") return;
    if (st === "char" || st === "image") {
      const ch = this.plugin.settings.treeSepChar || "";
      if (!ch) return;
      if (st === "image") {
        const img = parent.createSpan({ cls: "gd-tree-sep is-img", attr: { title: "分隔" } });
        img.style.backgroundImage = 'url("' + ch + '")';
        return;
      }
      parent.createSpan({ cls: "gd-tree-sep is-char", text: ch });
      return;
    }
    parent.createSpan({ cls: "gd-tree-sep is-" + st, attr: { "aria-hidden": "true" } });
  }

  /* ---------- 顶部 ⋯ 菜单（瘦身模式下替代原来的三个按钮） ---------- */
  topMenu(evt) {
    const m = new Menu();
    m.addItem((i) => i.setTitle("打开今天的日记").setIcon("calendar-check").onClick(() => this.plugin.openDay(todayStr())));
    m.addItem((i) => i.setTitle("今天再写一篇").setIcon("calendar-plus").onClick(() => this.plugin.newEntryFor(todayStr())));
    m.addItem((i) => i.setTitle("刷新目录").setIcon("refresh-cw").onClick(() => this.render()));
    m.addSeparator();
    m.addItem((i) => i.setTitle("打开时间线").setIcon("git-branch").onClick(() => this.plugin.openTimeline()));
    m.addItem((i) => i.setTitle("时间线浮窗").setIcon("picture-in-picture-2").onClick(() => this.plugin.openTimelineFloat()));
    m.addItem((i) => i.setTitle("打开日历").setIcon("calendar").onClick(() => this.plugin.openCalendar()));
    m.addItem((i) => i.setTitle("表格形态看这一天").setIcon("table").onClick(() => this.plugin.openTable(this.plugin.keyOfGridView())));
    m.addSeparator();
    m.addItem((i) => i.setTitle("展开全部月份").setIcon("chevrons-down").onClick(() => { this.collapsedMonth.clear(); this.renderFiles(); }));
    m.addItem((i) => i.setTitle("折叠全部月份").setIcon("chevrons-up").onClick(() => {
      const all = this.collect().all;
      for (const f of all) { const d = splitDayKey(f.basename).date; if (d) this.collapsedMonth.add(d.slice(0, 7)); }
      this.renderFiles();
    }));
    showMenuAt(m, evt);
  }

  /* ---------- 拖拽移动文件 / 文件夹（A4） ---------- */
  /* 移动模式：拖文件夹换顺序（用户：「直接拖动这个文件夹它就会调整顺序」） */
  bindFolderDrag(row, key) {
    const handle = row.createSpan({ cls: "gd-tree-grip", text: "⋮⋮", attr: { title: "拖动换顺序" } });
    row.insertBefore(handle, row.firstChild);
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/gd-folder", key);
      row.addClass("is-dragging");
    });
    row.addEventListener("dragend", () => row.removeClass("is-dragging"));
    row.addEventListener("dragover", (e) => {
      if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes("text/gd-folder")) {
        e.preventDefault();
        row.addClass("is-drop");
      }
    });
    row.addEventListener("dragleave", () => row.removeClass("is-drop"));
    row.addEventListener("drop", async (e) => {
      const src = e.dataTransfer && e.dataTransfer.getData("text/gd-folder");
      row.removeClass("is-drop");
      if (!src || src === key) return;
      e.preventDefault();
      e.stopPropagation();
      const s = this.plugin.settings;
      const order = this.orderFolders([...this.collect().folders.keys()]).filter((k) => k !== "");
      const from = order.indexOf(src);
      if (from >= 0) order.splice(from, 1);
      const at = order.indexOf(key);
      order.splice(at < 0 ? order.length : at, 0, src);
      s.treeFolderOrder = order;
      await this.plugin.saveSettings();
      this.renderFolders();
      new Notice("顺序已调整");
    });
  }

  bindDragRow(row, file) {
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", (e) => {
      this._dragFile = file;
      row.addClass("is-dragging");
      try { e.dataTransfer.setData("text/plain", file.path); e.dataTransfer.effectAllowed = "move"; } catch (_) { }
    });
    row.addEventListener("dragend", () => { this._dragFile = null; row.removeClass("is-dragging"); });
  }

  bindDropTarget(row, folderPath) {
    if (this.plugin.settings.treeDragMove === false) return;
    const ok = () => !!this._dragFile && this._dragFile.parent && this._dragFile.parent.path !== folderPath;
    row.addEventListener("dragover", (e) => { if (ok()) { e.preventDefault(); row.addClass("is-drop"); } });
    row.addEventListener("dragleave", () => row.removeClass("is-drop"));
    row.addEventListener("drop", async (e) => {
      row.removeClass("is-drop");
      const f = this._dragFile;
      if (!ok()) return;
      e.preventDefault(); e.stopPropagation();
      const root = normalizePath(this.plugin.settings.rootFolder || "日记");
      const target = normalizePath((folderPath ? root + "/" + folderPath : root) + "/" + f.name);
      try {
        await this.app.fileManager.renameFile(f, target);
        new Notice("已移动到 " + (folderPath || "根目录"));
        this.plugin.refreshAll();
      } catch (err) { new Notice("移动失败：" + (err && err.message ? err.message : err)); }
      this._dragFile = null;
    });
  }

  folderMenu(evt, folder) {
    const m = new Menu();
    m.addItem((i) => i.setTitle("只在这个文件夹里看").setIcon("filter").onClick(() => {
      this.activeFolder = folder; this.renderFolders(); this.renderFiles();
    }));
    m.addItem((i) => i.setTitle("看全部日记").setIcon("layers").onClick(() => {
      this.activeFolder = ""; this.renderFolders(); this.renderFiles();
    }));
    if (folder) {
      m.addSeparator();
      m.addItem((i) => i.setTitle("今天在这个文件夹里写一篇").setIcon("calendar-plus").onClick(async () => {
        const old = this.plugin.settings.rootFolder;
        this.plugin.settings.rootFolder = normalizePath(old + "/" + folder);
        await this.plugin.newEntryFor(todayStr());
        this.plugin.settings.rootFolder = old;
      }));
      m.addItem((i) => i.setTitle("这个文件夹的外观…").setIcon("palette").onClick(() => this.folderAppearanceMenu(folder)));
      const hid = Array.isArray(this.plugin.settings.treeHiddenFolders) ? this.plugin.settings.treeHiddenFolders : [];
      const isHid = hid.includes(folder);
      m.addItem((i) => i.setTitle(isHid ? "取消隐藏" : "隐藏这个文件夹").setIcon(isHid ? "eye" : "eye-off").onClick(async () => {
        let arr = hid.slice();
        if (isHid) arr = arr.filter((x) => x !== folder); else arr.push(folder);
        this.plugin.settings.treeHiddenFolders = arr;
        await this.plugin.saveSettings();
        this.renderFolders();
      }));
      m.addItem((i) => i.setTitle("上移一位").setIcon("arrow-up").onClick(async () => this.shiftFolder(folder, -1)));
      m.addItem((i) => i.setTitle("下移一位").setIcon("arrow-down").onClick(async () => this.shiftFolder(folder, 1)));
    }
    showMenuAt(m, evt);
  }

  async summary(file) {
    const cached = this.summaryCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached;
    let text = "", img = "", words = 0;
    try {
      const raw = await this.app.vault.cachedRead(file);
      const parsed = parseDay(raw);
      const filled = parsed.cells.find((c) => c.content && c.content.trim());
      text = filled ? truncate(`${filled.title} · ${filled.content}`, 60) : "（空）";
      for (const c of parsed.cells) if (c.content) words += c.content.replace(/\s/g, "").length;
      for (const c of parsed.cells) {
        const m = /!\[\[([^\]|]+)|!\[[^\]]*\]\(([^)]+)\)/.exec(c.content || "");
        if (m) { img = (m[1] || m[2] || "").trim(); break; }
      }
      if (!img && parsed.layout && parsed.layout.cover) img = parsed.layout.cover;
    } catch (e) { text = ""; }
    const out = { mtime: file.stat.mtime, text, img, words };
    this.summaryCache.set(file.path, out);
    return out;
  }
  showItemMenu(evt, file) {
    const menu = new Menu();
    const isDay = DATE_RE.test(file.name);
    const key = isDay ? file.basename : "";
    const s = this.plugin.settings;

    /* ---- 打开（对齐原生 + 格子视图） ---- */
    if (isDay) {
      menu.addItem((i) => i.setTitle("在格子里打开").setIcon("layout-grid").onClick(() => this.plugin.openDay(key)));
      menu.addItem((i) => i.setTitle("用表格打开").setIcon("table").onClick(() => this.plugin.openTable(key)));
      menu.addItem((i) => i.setTitle("放到右侧栏打开").setIcon("sidebar-right").onClick(() => {
        this.app.workspace.getRightLeaf(false).setViewState({ type: "gd-grid-view", state: { key } });
      }));
    }
    menu.addItem((i) => i.setTitle("在新标签页打开").setIcon("file-plus").onClick(() => this.app.workspace.getLeaf("tab").openFile(file)));
    menu.addItem((i) => i.setTitle("在新窗口打开").setIcon("popup-open").onClick(() => {
      this.app.workspace.openPopoutLeaf && this.app.workspace.openPopoutLeaf().openFile(file);
    }));
    menu.addSeparator();

    /* ---- 编辑 ---- */
    menu.addItem((i) => i.setTitle("重命名…").setIcon("pencil").onClick(async () => {
      new PromptModal(this.app, "重命名", "新的文件名（不含 .md）", file.basename, async (v) => {
        const name = String(v || "").trim();
        if (!name || name === file.basename) return;
        const folder = file.parent ? file.parent.path : "";
        const target = normalizePath((folder ? folder + "/" : "") + name + ".md");
        try {
          await this.app.fileManager.renameFile(file, target);
          new Notice("已重命名");
          this.plugin.refreshAll();
        } catch (e) { new Notice("重命名失败：" + (e && e.message ? e.message : e)); }
      }).open();
    }));
    menu.addItem((i) => i.setTitle("复制一份").setIcon("copy").onClick(() => {
      try {
        this.app.fileManager.duplicateFile(file);
        new Notice("已复制一份");
      } catch (e) {
        /* 老版本 Obsidian 没有 duplicateFile，退回自己复制 */
        (async () => {
          const folder = file.parent ? file.parent.path : "";
          const data = await this.app.vault.read(file);
          const base = file.basename + " 副本";
          let path = normalizePath((folder ? folder + "/" : "") + base + ".md");
          let n = 2;
          while (this.app.vault.getAbstractFileByPath(path)) {
            path = normalizePath((folder ? folder + "/" : "") + base + " " + n + ".md");
            n++;
          }
          await this.app.vault.create(path, data);
          new Notice("已复制一份");
          this.plugin.refreshAll();
        })();
      }
    }));
    menu.addItem((i) => i.setTitle("移动到…").setIcon("folder-input").onClick(() => this.moveMenu(file)));
    menu.addSeparator();

    /* ---- 自定义：收藏 / 封面 / 皮肤 ---- */
    const favs = s.favoriteFiles || [];
    const isFav = favs.includes(file.path);
    menu.addItem((i) => i.setTitle(isFav ? "取消收藏" : "收藏这篇").setIcon(isFav ? "star-off" : "star")
      .onClick(async () => {
        let arr = Array.isArray(s.favoriteFiles) ? s.favoriteFiles.slice() : [];
        if (isFav) arr = arr.filter((x) => x !== file.path);
        else arr.unshift(file.path);
        s.favoriteFiles = arr.slice(0, 50);
        await this.plugin.saveSettings();
        this.render();
      }));
    if (isDay) {
      menu.addItem((i) => i.setTitle("给这天设封面…").setIcon("image").onClick(async () => {
        const f = await chooseFileLike(this.plugin, { title: "给这天设封面" });
        if (!f) return;
        await this.plugin.setCoverFor(key, f);
      }));
      menu.addItem((i) => i.setTitle("这一篇换皮肤").setIcon("palette").onClick(() => {
        const m = new Menu();
        for (const [v, n] of THEMES) {
          m.addItem((x) => x.setTitle(n).setChecked(s.theme === v).onClick(async () => {
            await this.plugin.applySkinToAll(v, null, 0, [key]);
          }));
        }
        const md = this.app.workspace.containerEl;
        showMenuAt(m, { clientX: evt.clientX, clientY: evt.clientY, preventDefault() {}, currentTarget: md });
      }));
    }
    menu.addSeparator();

    /* ---- 版本与快照 ---- */
    menu.addItem((i) => i.setTitle("查看版本历史 / 恢复").setIcon("history").onClick(() => new SnapshotModal(this.app, this.plugin, file).open()));
    menu.addItem((i) => i.setTitle("立即存快照").setIcon("save").onClick(async () => {
      await this.plugin.history.snapshot(file, "手动", true);
      new Notice("已保存快照");
    }));
    menu.addSeparator();

    /* ---- 系统与路径（原生功能） ---- */
    menu.addItem((i) => i.setTitle("复制文件名").setIcon("clipboard").onClick(() => {
      navigator.clipboard.writeText(file.basename); new Notice("已复制");
    }));
    menu.addItem((i) => i.setTitle("复制笔记库内路径").setIcon("clipboard-list").onClick(() => {
      navigator.clipboard.writeText(file.path); new Notice("已复制路径");
    }));
    menu.addItem((i) => i.setTitle("复制完整路径").setIcon("hard-drive").onClick(() => {
      const base = this.app.vault.adapter.basePath || "";
      navigator.clipboard.writeText(base ? normalizePath(base + "/" + file.path) : file.path);
      new Notice("已复制完整路径");
    }));
    if (this.app.showInFolder) {
      menu.addItem((i) => i.setTitle("在系统文件管理器里显示").setIcon("folder-open").onClick(() => {
        try { this.app.showInFolder(file.path); } catch (e) { new Notice("打不开文件管理器"); }
      }));
    }
    menu.addSeparator();

    /* ---- 删除 ---- */
    menu.addItem((i) => i.setTitle("删除这篇（可恢复）").setIcon("trash").onClick(() => {
      new ConfirmModal(this.app, "删除这篇日记？", `${file.basename}.md 会移进 Obsidian 回收站，同时留一份完整快照，可随时恢复。`, async () => {
        const content = await this.app.vault.read(file);
        this.plugin.history.recordDelete(file, content);
        this.plugin.history.pushUndo(file, content, "删除日记");
        await this.plugin.history.snapshot(file, "删除前", true);
        await this.app.vault.trash(file, false);
        new Notice("已移入回收站，可用「撤销」恢复");
        this.plugin.refreshAll();
      }).open();
    }));
    menu.addItem((i) => i.setTitle("永久删除…").setIcon("trash-2").onClick(() => {
      new ConfirmModal(this.app, "永久删除？", "这个操作不进回收站，删了就找不回来（快照里还有一份，但正文会没）。", async () => {
        const content = await this.app.vault.read(file);
        this.plugin.history.recordDelete(file, content);
        await this.app.vault.delete(file, true);
        new Notice("已永久删除");
        this.plugin.refreshAll();
      }, "永久删除", "取消").open();
    }));

    showMenuAt(menu, evt);
  }

  /* 移动到别的文件夹 */
  moveMenu(file) {
    const m = new Menu();
    const folders = [""];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f.path && f.children) folders.push(f.path);
    }
    const cur = file.parent ? file.parent.path : "";
    for (const f of folders.slice(0, 40)) {
      if (f === cur) continue;
      m.addItem((i) => i.setTitle(f || "/（库根目录）").setIcon("folder").onClick(async () => {
        const target = normalizePath((f ? f + "/" : "") + file.name);
        try {
          await this.app.fileManager.renameFile(file, target);
          new Notice("已移动");
          this.plugin.refreshAll();
        } catch (e) { new Notice("移动失败：" + (e && e.message ? e.message : e)); }
      }));
    }
    showMenuAt(m, { clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}, currentTarget: this.contentEl });
  }

  /* ---------- 每个文件夹独立外观 ---------- */
  folderAppearanceMenu(folder) {
    const m = new Menu();
    const s = this.plugin.settings;
    const st = this.folderStyle(folder) || {};
    m.addItem((i) => i.setTitle("选个颜色").setIcon("droplet").onClick(() => {
      const cm = new Menu();
      for (const [n, v] of [["墨黑", "#3b3f45"], ["雾蓝", "#5b7fa6"], ["苔绿", "#6f8f5e"], ["赭石", "#a8744a"], ["紫灰", "#806d94"], ["砖红", "#b4574e"], ["金", "#b08b3e"], ["不用颜色", ""]]) {
        cm.addItem((x) => x.setTitle(n).onClick(async () => {
          const all = s.treeFolderStyles || {};
          all[folder] = Object.assign({}, all[folder] || {}, { color: v });
          s.treeFolderStyles = all;
          await this.plugin.saveSettings();
          this.renderFolders();
        }));
      }
      showMenuAt(cm, { clientX: 240, clientY: 240, preventDefault() { }, currentTarget: this.contentEl });
    }));
    m.addItem((i) => i.setTitle("选个表情当图标").setIcon("smile").onClick(() => {
      const em = new Menu();
      for (const e of ["📁", "📚", "🗂", "📔", "✍️", "🎧", "🌿", "☕", "🌙", "⭐", "🐟", "🎨", "不用表情", ""]) {
        em.addItem((x) => x.setTitle(e || "（清空）").onClick(async () => {
          const all = s.treeFolderStyles || {};
          all[folder] = Object.assign({}, all[folder] || {}, { emoji: e, icon: "" });
          s.treeFolderStyles = all;
          await this.plugin.saveSettings();
          this.renderFolders();
        }));
      }
      showMenuAt(em, { clientX: 240, clientY: 260, preventDefault() { }, currentTarget: this.contentEl });
    }));
    /* 用图片当图标：用户「我喜欢用图片缩略图这些东西或者说一些网址直接导进去」 */
    m.addItem((i) => i.setTitle("用图片当图标…").setIcon("image").onClick(() => {
      const im = new Menu();
      im.addItem((x) => x.setTitle("从库里选一张").setIcon("folder-open").onClick(async () => {
        const got = await chooseImage(this.app, this.plugin, { title: "给「" + folder + "」选一张图标", multiple: false });
        if (!got || !got.path) return;
        const all = s.treeFolderStyles || {};
        all[folder] = Object.assign({}, all[folder] || {}, { img: got.path, emoji: "", icon: "" });
        s.treeFolderStyles = all;
        await this.plugin.saveSettings();
        this.renderFolders();
      }));
      im.addItem((x) => x.setTitle("粘一个网址").setIcon("link").onClick(() => {
        new PromptModal(this.app, "图片网址", "直接填网址，不下载，换起来最快", st.img && /^https?:/i.test(st.img) ? st.img : "", async (v) => {
          const url = String(v || "").trim();
          if (!url) return;
          const all = s.treeFolderStyles || {};
          all[folder] = Object.assign({}, all[folder] || {}, { img: url, emoji: "", icon: "" });
          s.treeFolderStyles = all;
          await this.plugin.saveSettings();
          this.renderFolders();
        }).open();
      }));
      im.addItem((x) => x.setTitle("不用图片").setIcon("x").onClick(async () => {
        const all = s.treeFolderStyles || {};
        all[folder] = Object.assign({}, all[folder] || {}, { img: "" });
        s.treeFolderStyles = all;
        await this.plugin.saveSettings();
        this.renderFolders();
      }));
      showMenuAt(im, { clientX: 240, clientY: 280, preventDefault() { }, currentTarget: this.contentEl });
    }));
    m.addItem((i) => i.setTitle("用图标字体").setIcon("icons").onClick(() => {
      const im = new Menu();
      for (const ic of ["folder", "book", "notebook-pen", "library", "archive", "star", "heart", "leaf", "coffee", "moon"]) {
        im.addItem((x) => x.setTitle(ic).setIcon(ic).onClick(async () => {
          const all = s.treeFolderStyles || {};
          all[folder] = Object.assign({}, all[folder] || {}, { icon: ic, emoji: "" });
          s.treeFolderStyles = all;
          await this.plugin.saveSettings();
          this.renderFolders();
        }));
      }
      showMenuAt(im, { clientX: 240, clientY: 260, preventDefault() { }, currentTarget: this.contentEl });
    }));
    m.addSeparator();
    m.addItem((i) => i.setTitle("恢复这个文件夹的默认外观").setIcon("rotate-ccw").onClick(async () => {
      const all = s.treeFolderStyles || {};
      delete all[folder];
      s.treeFolderStyles = all;
      await this.plugin.saveSettings();
      this.renderFolders();
    }));
    showMenuAt(m, { clientX: 240, clientY: 240, preventDefault() { }, currentTarget: this.contentEl });
  }

  /* 文件夹手动排序 */
  async shiftFolder(folder, dir) {
    const keys = this.orderFolders([...this.collect().folders.keys()]).filter((k) => k !== "");
    const i = keys.indexOf(folder);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    const arr = keys.slice();
    const t0 = arr[i]; arr[i] = arr[j]; arr[j] = t0;
    this.plugin.settings.treeFolderOrder = arr;
    await this.plugin.saveSettings();
    this.renderFolders();
  }

  async onClose() { this.renderDebounced.cancel(); }
}

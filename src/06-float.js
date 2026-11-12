/* ============ 悬浮窗：不占主区，随时写一格就关 ============
 * Obsidian 的 ItemView 一定占主区/侧栏，做不到"浮在上面"，
 * 所以这里用 position:fixed 的浮层自己画。
 * 特点：拖动 / 缩放 / 贴边半收 / 三档尺寸 / 位置记忆 / 不锁背景（不是 Modal）。
 * ============================================================ */

const FLOAT_SIZES = { s: { w: 480, h: 420 }, m: { w: 720, h: 660 }, l: { w: 1000, h: 760 } };

class GDFloat {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
    this.key = todayStr();
    this.cells = [];
    this.fm = "";
    this.h1 = "";
    this.layout = {};
    this.docked = "";
    this.drag = null;
    /* v3.23：浮窗有两种模式。
       grid = 老样子，读当天那篇九宫格日记；
       note = 普通笔记，直接编辑任意 md，不走模板、不切格子、不受日期限制。
       用户原话：「灵感悬浮窗设置成不仅有与格子联动还可以当成一个普通的记笔记工具（非格子，
       不需要格式）……我想使用灵感记录非格子以外总是显示没有对应的模板，不可以这样单一化。」 */
    this.mode = "grid";
    this.notePath = "";       // note 模式下当前文件的库内路径
    this.noteTimer = null;
    this.saveTimer = debounce(() => this.saveNow(), 800);
  }
  get app() { return this.plugin.app; }
  get sx() { return this.plugin.settings; }

  toggle() {
    if (this.el) this.close();
    else this.open();
  }
  async open(key) {
    if (this.el) { if (key) await this.load(key); return; }
    /* v3.23：恢复上次用的模式（格子 / 普通笔记） */
    this.mode = this.sx.floatMode === "note" ? "note" : "grid";
    const host = document.body;
    const wrap = document.createElement("div");
    wrap.addClass("gd-root");
    wrap.addClass("gd-float");
    wrap.addClass(`gd-theme-${this.sx.theme || "card"}`);
    host.appendChild(wrap);
    this.el = wrap;
    const r = this.sx.floatRect || {};
    const size = FLOAT_SIZES[this.sx.floatSize] || FLOAT_SIZES.m;
    const w = clamp(r.width || size.w, 360, 1400);
    const h = clamp(r.height || size.h, 320, 1200);
    const vw = window.innerWidth, vh = window.innerHeight;
    wrap.style.width = `${w}px`;
    wrap.style.height = `${h}px`;
    wrap.style.left = `${clamp(r.left != null ? r.left : vw - w - 40, 0, Math.max(0, vw - w))}px`;
    wrap.style.top = `${clamp(r.top != null ? r.top : 90, 0, Math.max(0, vh - h))}px`;
    this.build();
    if (this.mode === "note") { await this.loadNote(this.notePath || ""); return; }
    await this.load(key || todayStr());
  }
  close() {
    this.saveTimer.cancel();
    this.saveNow(true);
    if (this._esc) { window.removeEventListener("keydown", this._esc); this._esc = null; }
    if (this.el) { this.el.remove(); this.el = null; }
  }
  build() {
    const el = this.el;
    el.empty();
    this.barEl = el.createDiv({ cls: "gd-float-bar" });
    const title = this.barEl.createDiv({ cls: "gd-float-title", text: this.sx.floatTitle || "灵感笔记" });
    title.setAttribute("title", "双击改名字");
    title.addEventListener("dblclick", () => {
      new PromptModal(this.app, "给这个悬浮窗起个名字", "显示在标题栏", this.sx.floatTitle || "灵感笔记", async (v) => {
        this.sx.floatTitle = String(v || "").trim() || "灵感笔记";
        await this.plugin.saveSettings();
        this.build();
      }).open();
    });
    const ops = this.barEl.createDiv({ cls: "gd-float-ops" });
    const b = (text, title2, fn) => {
      const btn = ops.createEl("button", { text, cls: "gd-float-btn", attr: { title: title2 } });
      btn.onclick = (e) => { e.stopPropagation(); fn(e); };
      return btn;
    };
    b("大", "切换尺寸（小 / 中 / 大）", () => this.cycleSize());
    b("≡", "在主区打开这一天 / 这篇", () => this.openInMain());
    /* v3.23：格子 / 笔记 两模式一键切 */
    const modeBtn = b(this.mode === "note" ? "▦" : "✎",
      this.mode === "note" ? "切回格子模式（跟当天日记联动）" : "切成普通笔记（随便写，不进格子）",
      () => this.toggleMode());
    modeBtn.addClass("gd-float-mode");
    b("—", "收缩成一条（再点展开）", () => this.collapseBar());
    b("×", "关闭悬浮窗（位置会记住）", () => this.close());

    this.scrollEl = el.createDiv({ cls: "gd-float-scroll" });
    this.dateEl = this.scrollEl.createDiv({ cls: "gd-float-date" });
    this.gridEl = this.scrollEl.createDiv({ cls: "gd-grid gd-float-grid" });
    this.noteEl = this.scrollEl.createDiv({ cls: "gd-float-note" });
    this.footEl = el.createDiv({ cls: "gd-float-foot" });
    el.toggleClass("is-note-mode", this.mode === "note");

    /* 拖动标题条 */
    this.barEl.addEventListener("pointerdown", (ev) => {
      if (ev.target && ev.target.closest("button")) return;
      this.startDrag(ev);
    });
    /* 右下角缩放 */
    const grip = el.createDiv({ cls: "gd-float-grip", attr: { title: "拖动缩放" } });
    grip.addEventListener("pointerdown", (ev) => this.startResize(ev));
    /* 5.5：四个角都能拖（不显眼，只有靠近时才显出来），跟右下角是同一套缩放 */
    for (const c of ["nw", "ne", "sw", "se"]) {
      const g = el.createDiv({ cls: "gd-float-corner is-" + c });
      g.addEventListener("pointerdown", (ev) => this.startResize(ev, c));
    }
    /* Esc 关闭 */
    this._esc = (ev) => { if (ev.key === "Escape") this.close(); };
    window.addEventListener("keydown", this._esc);
  }
  startDrag(ev) {
    ev.preventDefault();
    const r = this.el.getBoundingClientRect();
    const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    this.el.addClass("is-dragging");
    const move = (e) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = clamp(e.clientX - dx, -r.width + 60, vw - 60);
      const top = clamp(e.clientY - dy, 0, vh - 40);
      this.el.style.left = `${left}px`;
      this.el.style.top = `${top}px`;
      /* 贴边半收 */
      if (this.sx.floatEdgeDock) {
        if (left <= 8) this.el.addClass("dock-left");
        else this.el.removeClass("dock-left");
        if (left + r.width >= vw - 8) this.el.addClass("dock-right");
        else this.el.removeClass("dock-right");
      }
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      this.el.removeClass("is-dragging");
      this.remember();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  startResize(ev, corner) {
    ev.preventDefault(); ev.stopPropagation();
    const r = this.el.getBoundingClientRect();
    const x0 = ev.clientX, y0 = ev.clientY, w0 = r.width, h0 = r.height;
    const l0 = r.left, t0 = r.top;
    const c = corner || "se";
    this.el.addClass("is-resizing");
    const move = (e) => {
      const dx = e.clientX - x0, dy = e.clientY - y0;
      let w = w0, h = h0, left = l0, top = t0;
      if (c.includes("e")) w = clamp(Math.round(w0 + dx), 360, 1400);
      if (c.includes("s")) h = clamp(Math.round(h0 + dy), 320, 1200);
      if (c.includes("w")) {
        w = clamp(Math.round(w0 - dx), 360, w0 + l0);
        left = l0 + (w0 - w);
      }
      if (c.includes("n")) {
        h = clamp(Math.round(h0 - dy), 320, h0 + t0);
        top = t0 + (h0 - h);
      }
      this.el.style.width = `${w}px`;
      this.el.style.height = `${h}px`;
      if (c.includes("w")) this.el.style.left = `${left}px`;
      if (c.includes("n")) this.el.style.top = `${top}px`;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      this.el.removeClass("is-resizing");
      this.render();
      this.remember();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  remember() {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    this.sx.floatRect = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    this.plugin.saveSettings();
  }
  cycleSize() {
    const order = ["s", "m", "l"];
    const i = order.indexOf(this.sx.floatSize || "m");
    const next = order[(i + 1) % order.length];
    this.sx.floatSize = next;
    const sz = FLOAT_SIZES[next];
    this.el.style.width = `${sz.w}px`;
    this.el.style.height = `${sz.h}px`;
    this.render();
    this.remember();
    new Notice(next === "s" ? "小窗" : next === "m" ? "中窗" : "大窗");
  }
  collapseBar() {
    this.el.toggleClass("is-collapsed");
  }

  async load(key) {
    if (this.mode === "note") { await this.loadNote(); return; }
    this.key = key || todayStr();
    const folder = normalizePath(this.sx.rootFolder || "日记");
    const path = `${folder}/${this.key}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      file = await this.plugin.createDayFileFor(this.key);
    }
    this.file = file;
    const text = await this.app.vault.read(file);
    const parsed = parseDay(text, this.sx.headingLevel);
    this.fm = parsed.fm; this.h1 = parsed.h1;
    this.layout = normalizeLayout(parsed.layout, this.sx);
    this.cells = normalizeCells(parsed.cells, parsed.layout, this.sx);
    this.render();
  }

  /* ---------- v3.23：普通笔记模式 ----------
   * 读任意一篇 md 当纯文本编辑，不解析成格子、不进模板、不要求文件名叫日期。
   * 没选过文件就自己建一篇「灵感-时间戳.md」放在灵感目录里。 */
  noteFolder() { return normalizePath(this.sx.floatNoteFolder || "灵感"); }
  async createNote() {
    const folder = this.noteFolder();
    await this.plugin.ensureFolder(folder);
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    let path = `${folder}/灵感-${stamp}.md`;
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/灵感-${stamp}-${i++}.md`;
    await this.app.vault.create(path, "");
    return path;
  }
  async loadNote(path) {
    let p = path || this.notePath;
    if (!p || !(this.app.vault.getAbstractFileByPath(normalizePath(p)) instanceof TFile)) {
      p = await this.createNote();
    }
    this.notePath = p;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(p));
    this.noteFile = f;
    this.render();
  }
  /* 切模式：格子 ⇄ 笔记。笔记模式下没有日期翻页，也不会再去找模板。
     先把模式定下来，再重建外壳（按钮图标跟着模式变），最后加载对应内容。 */
  async toggleMode() {
    this.mode = this.mode === "note" ? "grid" : "note";
    try { this.plugin.settings.floatMode = this.mode; this.plugin.saveSettings(); } catch (e) { }
    this.build();
    if (this.mode === "note") await this.loadNote(this.notePath || "");
    else await this.load(this.key);
  }
  /* 只刷新外观（背景 / 字色 / 圆角 / 皮肤），绝不重建内容。
     v3.24：设置页调外观时用它，避免把正在写的 textarea 拆掉。 */
  paintShell() {
    if (!this.el) return;
    const el = this.el;
    el.style.setProperty("--gd-cols", String(clamp(this.sx.columns, 1, 6)));
    el.style.setProperty("--gd-row-h", `${clamp(this.sx.rowHeight, 80, 600)}px`);
    el.style.setProperty("--gd-gap", `${clamp(this.sx.gap, 0, 48)}px`);
    el.style.setProperty("--gd-radius", `${clamp(this.sx.radius, 0, 28)}px`);
    el.style.setProperty("--gd-font-size", `${clamp(this.sx.fontSize, 10, 26)}px`);
    el.classList.toggle("is-hover-lift", !!this.sx.hoverLift);
    try { this.plugin.applyShellTheme(el, this.sx.floatFollowTheme === false ? "float" : null); } catch (e) { }
    try { this.plugin.applyProjectBg && this.plugin.applyProjectBg(); } catch (e) { }
    const bg = this.sx.floatBg || "";
    const op = clamp(this.sx.floatBgOpacity == null ? 1 : this.sx.floatBgOpacity, 0.2, 1);
    el.style.setProperty("--gd-float-bg-opacity", String(op));
    if (bg) {
      const u = /^https?:\/\//i.test(bg) ? bg : (this.plugin.thumbUrl ? this.plugin.thumbUrl(bg) : "");
      if (u) {
        el.style.backgroundImage = 'url("' + u + '")';
        el.addClass("has-bg");
      }
    } else {
      el.style.backgroundImage = "";
      el.removeClass("has-bg");
    }
  }
  render() {
    if (!this.el) return;
    const el = this.el;
    const cols = clamp(this.sx.columns, 1, 6);
    el.style.setProperty("--gd-cols", String(cols));
    el.style.setProperty("--gd-row-h", `${clamp(this.sx.rowHeight, 80, 600)}px`);
    el.style.setProperty("--gd-gap", `${clamp(this.sx.gap, 0, 48)}px`);
    el.style.setProperty("--gd-radius", `${clamp(this.sx.radius, 0, 28)}px`);
    el.style.setProperty("--gd-accent", this.sx.accent || "#c2704f");
    el.style.setProperty("--gd-font-size", `${clamp(this.sx.fontSize, 10, 26)}px`);
    el.classList.toggle("is-hover-lift", !!this.sx.hoverLift);
    /* v3.21：字色 / 线色 / 圆角 / 皮肤跟随主题；关掉「跟随主题」才用悬浮窗自己的配色 */
    try { this.plugin.applyShellTheme(el, this.sx.floatFollowTheme === false ? "float" : null); } catch (e) {}
    try { this.plugin.applyProjectBg && this.plugin.applyProjectBg(); } catch (e) {}

    /* 灵感背景：只留两项 —— 图片 + 透明度（用户明确要求）。
       以前这四行写的是 calFloatBg / calFloatOpacity / calFloatBlur / calFloatShadow，
       那是日历浮窗的字段，改的是日历不是灵感，所以两边串了。
       现在用自己的 floatBg / floatBgOpacity。 */
    const bg = this.sx.floatBg || "";
    const op = clamp(this.sx.floatBgOpacity == null ? 1 : this.sx.floatBgOpacity, 0.2, 1);
    el.style.setProperty("--gd-float-bg-opacity", String(op));
    if (bg) {
      const u = /^https?:\/\//i.test(bg) ? bg : (this.plugin.thumbUrl ? this.plugin.thumbUrl(bg) : "");
      if (u) {
        el.style.backgroundImage = 'url("' + u + '")';
        el.addClass("has-bg");
      }
    } else {
      el.style.backgroundImage = "";
      el.removeClass("has-bg");
    }

    this.dateEl.empty();
    if (this.mode === "note") {
      /* 笔记模式：标题换成文件名，右边一排「新建 / 挑一篇 / 在库里打开」，没有日期翻页 */
      const f = this.noteFile || (this.notePath ? this.app.vault.getAbstractFileByPath(normalizePath(this.notePath)) : null);
      this.dateEl.createSpan({ cls: "gd-float-day", text: f ? f.basename : "新笔记" });
      const nav = this.dateEl.createDiv({ cls: "gd-float-nav" });
      const nb2 = (t, tt, fn) => { const x = nav.createEl("button", { text: t, cls: "gd-float-mini", attr: { title: tt } }); x.onclick = fn; };
      nb2("＋新", "新建一篇空白笔记", async () => { this.notePath = ""; await this.loadNote(""); this.render(); });
      nb2("挑", "从库里挑一篇已有的 md", () => this.pickNote());
      this.renderNote();
      return;
    }
    this.dateEl.createSpan({ cls: "gd-float-day", text: `${dateShort(this.key)} ${weekdayCN(this.key)}` });
    const nav = this.dateEl.createDiv({ cls: "gd-float-nav" });
    const nb = (t, tt, fn) => { const x = nav.createEl("button", { text: t, cls: "gd-float-mini", attr: { title: tt } }); x.onclick = fn; };
    nb("‹", "前一天", () => this.goDay(shiftDate(this.key, -1)));
    nb("今天", "回到今天", () => this.goDay(todayStr()));
    nb("›", "后一天", () => this.goDay(shiftDate(this.key, 1)));
    const add = nav.createEl("button", { text: "＋格", cls: "gd-float-mini", attr: { title: "加一格" } });
    add.onclick = () => this.addCell();

    this.gridEl.empty();
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    if (!this.cells.length) this.gridEl.createDiv({ cls: "gd-float-empty", text: "还没有格子，点「＋格」加一个" });
    this.cells.forEach((c) => this.renderCell(c));

    this.footEl.empty();
    this.footEl.createSpan({ text: `${this.cells.length} 格 · ${this.cells.reduce((n, x) => n + x.content.length, 0)} 字` });
    const hint = this.footEl.createSpan({ cls: "gd-float-hint", text: "Ctrl+S 保存 · Esc 关闭" });
    hint.onclick = () => this.saveNow(true);
  }

  /* ---------- v3.23：笔记模式的渲染 ----------
   * 一个整块的 textarea，直接写 md 原文。不做格子、不做格式、不弹模板。
   * v3.24 修：这段以前每 400ms 被 notifyRefresh 重建一次，输入时光标跟着飞。
   * 现在跟格子模式同一套保护：_saving 标记 + 焦点守卫，见 refresh()。 */
  async renderNote() {
    const el = this.noteEl;
    if (!el) return;
    this.gridEl.empty();
    this.gridEl.style.display = "none";
    el.style.display = "";
    el.empty();
    if (!this.notePath) {
      el.createDiv({ cls: "gd-float-empty", text: "点上面的「＋新」建一篇，或点「挑」选库里已有的一篇。" });
      this.footEl.empty();
      this.footEl.createSpan({ text: "普通笔记模式 · 不进格子、不需要模板" });
      return;
    }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.notePath));
    if (!(f instanceof TFile)) {
      el.createDiv({ cls: "gd-float-empty", text: "这篇不见了：可能被改名或删了。点「＋新」重开一篇。" });
      return;
    }
    this.noteFile = f;
    let text = "";
    try { text = await this.app.vault.read(f); } catch (e) { text = ""; }
    const ta = el.createEl("textarea", { cls: "gd-float-note-ta", attr: { placeholder: "随便写。这里是普通笔记，不进格子，不需要模板。" } });
    ta.value = text;
    ta.oninput = () => { this.saveNote(ta.value); };
    /* 失焦才落盘。以前这里同步调 saveNoteNow，配合下面 refresh 的重建会把光标顶掉 */
    ta.addEventListener("blur", () => this.saveNoteNow());
    /* Ctrl+S 立刻落盘 */
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); this.saveNoteNow(); }
    });

    this.paintNoteFoot(f, text);
  }
  /* 只更新底部字数，不碰 textarea —— 输入过程中只走这一条，绝不重建 */
  paintNoteFoot(f, text) {
    if (!this.footEl) return;
    this.footEl.empty();
    const base = (f && f.basename) || "新笔记";
    const len = String(text == null ? "" : text).length;
    this.footEl.createSpan({ text: `${base} · ${len} 字` });
    const open = this.footEl.createSpan({ cls: "gd-float-hint", text: "在库里打开" });
    open.onclick = () => {
      const ff = this.noteFile || (this.notePath ? this.app.vault.getAbstractFileByPath(normalizePath(this.notePath)) : null);
      if (ff instanceof TFile) { try { this.app.workspace.getLeaf(true).openFile(ff); } catch (e) { } }
    };
  }
  /* 从库里挑一篇 md 当笔记 */
  pickNote() {
    const files = (this.app.vault.getFiles() || []).filter((f) => f.extension === "md");
    new VaultPickModal(this.app, this.plugin, {
      title: "挑一篇笔记",
      allowVideo: false,
      mdOnly: true,
      onDone: async (list) => {
        if (!list || !list.length) return;
        this.notePath = list[0].path;
        await this.loadNote(this.notePath);
        this.render();
      },
    }).open();
  }
  saveNote(text) {
    if (!this.notePath) return;
    if (this.noteTimer) clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => this.saveNoteNow(text), 700);
  }
  /* v3.24：完全照搬格子模式 saveNow 的做法 ——
     落盘期间挂 _saving，写完再让别的视图知道「文件变了」。
     不调 notifyRefresh 就不会触发自己重建，光标不会飞。
     底部字数在写完后就地更新，也不碰 textarea。 */
  async saveNoteNow(text) {
    if (!this.notePath) return;
    if (this.noteTimer) { clearTimeout(this.noteTimer); this.noteTimer = null; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.notePath));
    if (!(f instanceof TFile)) return;
    const ta = this.noteEl ? this.noteEl.querySelector(".gd-float-note-ta") : null;
    const val = typeof text === "string" ? text : (ta ? ta.value : "");
    try {
      const cur = await this.app.vault.read(f);
      if (cur === val) { this.paintNoteFoot(f, val); return; }
      this._saving = true;
      try {
        await this.app.vault.modify(f, val);
        /* 只让别的视图知道文件变了；自己这边一个字都不动 */
        try { this.plugin.notifyRefresh && this.plugin.notifyRefresh(); } catch (e) { }
      } finally { this._saving = false; }
      this.paintNoteFoot(f, val);
    } catch (e) { this._saving = false; console.error("[格间日记] 笔记保存失败", e); }
  }
  /* 主区打开：格子模式打开那天，笔记模式打开那篇 */
  openInMain() {
    if (this.mode === "note" && this.notePath) {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(this.notePath));
      if (f instanceof TFile) { try { this.app.workspace.getLeaf(true).openFile(f); return; } catch (e) { } }
      return;
    }
    this.plugin.openDay(this.key);
  }
  renderCell(c) {
    const el = this.gridEl.createDiv({ cls: "gd-cell gd-float-cell" });
    el.dataset.border = c.border || this.layout.border || this.sx.defaultBorder || "hair";
    const head = el.createDiv({ cls: "gd-cell-head" });
    const ti = head.createEl("input", { cls: "gd-cell-title", attr: { placeholder: "格子标题" } });
    ti.value = c.title;
    ti.oninput = () => { c.title = ti.value; this.saveTimer(); };
    if (c.sticker) head.createSpan({ cls: "gd-cell-sticker", text: c.sticker });
    const more = head.createEl("button", { cls: "gd-cell-more", text: "＋", attr: { title: "加一格 / 插图" } });
    more.onclick = () => { this.addCell(); };
    const body = el.createDiv({ cls: "gd-cell-body" });
    const ta = body.createEl("textarea", { cls: "gd-cell-editor", attr: { placeholder: "写点什么…" } });
    ta.value = c.content;
    ta.oninput = () => { c.content = ta.value; this.saveTimer(); };
    /* 5.4：点空白处就自动保存。以前要等 800ms 的防抖，点了别处可能还没落盘。
       输入框一失焦立刻存（界面不动，见 saveNow 里的说明）。
       不传 immediate：失焦很频繁，不该每次都留快照。 */
    const flush = () => { if (!this.el) return; this.saveNow(); };
    ti.addEventListener("blur", flush);
    ta.addEventListener("blur", flush);
    ta.addEventListener("drop", async (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      e.preventDefault();
      for (const f of Array.from(files).slice(0, 4)) {
        try {
          const folder = normalizePath(`${this.sx.rootFolder || "日记"}/attachments`);
          await this.plugin.ensureFolder(folder);
          const safe = (f.name || "paste.png").replace(/[\\/:*?"<>|]/g, "_");
          let path = `${folder}/${safe}`;
          if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
          await this.app.vault.createBinary(path, await f.arrayBuffer());
          c.content = (c.content || "") + (c.content && !c.content.endsWith("\n") ? "\n" : "") + `![[${safe}|360]]`;
          ta.value = c.content;
          this.saveTimer();
        } catch (err) { new Notice("拖入失败：" + err.message); }
      }
    });
  }
  addCell() {
    new PromptModal(this.app, "新增格子", "标题（可以写成一句问句）", "新格子", (v) => {
      this.cells.push({ id: uid(), title: v.trim() || "新格子", content: "", cs: 1, rs: 1, h: 0, accent: "", collapsed: false, border: "", sticker: "" });
      this.render(); this.saveTimer();
    }).open();
  }
  async saveNow(immediate) {
    this.saveTimer.cancel();
    if (this.mode === "note") { await this.saveNoteNow(); return; }
    if (!(this.file instanceof TFile)) return;
    try {
      const text = serializeDay(this.key, this.cells, {
        fm: this.fm, h1: this.h1, columns: clamp(this.sx.columns, 1, 6),
        level: this.sx.headingLevel, layout: this.layout,
      });
      const cur = await this.app.vault.read(this.file);
      if (cur === text) return;
      this.plugin.history.pushUndo(this.file, cur, "悬浮窗编辑");
      if (this.sx.autoSnapshot && immediate) await this.plugin.history.snapshot(this.file, "悬浮窗");
      await this.app.vault.modify(this.file, text);
      /* 修「打字跳回预览」：保存完不能再触发全量刷新。
         以前这里调 notifyRefresh()，它会连带 refresh() → load() → render()，
         把正在编辑的输入框整个销毁，光标就丢了。
         现在只让别的视图知道「文件变了」，自己这边一个字都不动。 */
      this._saving = true;
      try { this.plugin.notifyRefresh && this.plugin.notifyRefresh(); } finally { this._saving = false; }
    } catch (e) { console.error("[格间日记] 悬浮窗保存失败", e); }
  }
  /* v3.21：浮窗自己换天 —— 先切自己，再让主区 / 日历跟上（不抢焦点） */
  goDay(key) {
    if (!key) return;
    if (splitDayKey(key).date !== splitDayKey(this.key).date) this.load(key);
    if (this.plugin.setActiveDay) this.plugin.setActiveDay(key, "float");
  }
  refresh(key, force) {
    if (!this.el) return;
    /* v3.24：笔记模式和格子模式走完全同一套保护。
       以前笔记分支直接 renderNote()，绕过 _saving 与焦点守卫，
       结果 notifyRefresh（400ms 防抖，文件一改就触发）反复重建 textarea，
       打字打到一半光标就飞、内容也存不全 —— 用户报的「输入时跳转保存」就是这条。
       现在：自己在保存中 / 光标在输入框里 → 一律不重建，只刷新底部字数。 */
    if (this.mode === "note") {
      if (this._saving) return;
      const act = document.activeElement;
      const inEditor = !!(act && this.el.contains(act) &&
        (act.tagName === "TEXTAREA" || act.tagName === "INPUT"));
      if (!force && inEditor) return;   // 正在写，一个字都别动
      /* 没在写的时候才允许同步一次（例如别的窗口改了同一个文件、或切了模式） */
      try { this.syncNoteFromDisk(); } catch (e) { }
      return;
    }
    /* 自己刚写完的、或者光标还在输入框里，就别重建，否则光标飞了。
       force=true 是「别的窗口换了天」，这时候必须跟，哪怕光标在输入框里。 */
    if (this._saving) return;
    const act2 = document.activeElement;
    if (!force && act2 && this.el.contains(act2) && (act2.tagName === "TEXTAREA" || act2.tagName === "INPUT")) return;
    if (key && splitDayKey(key).date !== splitDayKey(this.key).date) this.load(key);
    else this.load(this.key);
  }
  /* 把磁盘上的内容同步进已经开着的 textarea，但不重建它。
     光标位置、滚动位置都原样保住；内容没变就什么都不做。 */
  async syncNoteFromDisk() {
    if (this.mode !== "note" || !this.notePath) return;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.notePath));
    if (!(f instanceof TFile)) return;
    const ta = this.noteEl ? this.noteEl.querySelector(".gd-float-note-ta") : null;
    if (!ta) { await this.renderNote(); return; }
    let disk = "";
    try { disk = await this.app.vault.read(f); } catch (e) { return; }
    if (disk === ta.value) { this.paintNoteFoot(f, ta.value); return; }
    /* 磁盘内容和正在写的不一样：说明是外部改的，保留光标位置再换文本 */
    const s0 = ta.selectionStart, s1 = ta.selectionEnd;
    const top = ta.scrollTop;
    ta.value = disk;
    try { ta.selectionStart = Math.min(s0, disk.length); ta.selectionEnd = Math.min(s1, disk.length); } catch (e) { }
    ta.scrollTop = top;
    this.paintNoteFoot(f, disk);
  }
}

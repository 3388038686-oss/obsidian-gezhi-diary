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
    b("≡", "在主区打开这一天", () => this.plugin.openDay(this.key));
    b("—", "收缩成一条（再点展开）", () => this.collapseBar());
    b("×", "关闭悬浮窗（位置会记住）", () => this.close());

    this.scrollEl = el.createDiv({ cls: "gd-float-scroll" });
    this.dateEl = this.scrollEl.createDiv({ cls: "gd-float-date" });
    this.gridEl = this.scrollEl.createDiv({ cls: "gd-grid gd-float-grid" });
    this.footEl = el.createDiv({ cls: "gd-float-foot" });

    /* 拖动标题条 */
    this.barEl.addEventListener("pointerdown", (ev) => {
      if (ev.target && ev.target.closest("button")) return;
      this.startDrag(ev);
    });
    /* 右下角缩放 */
    const grip = el.createDiv({ cls: "gd-float-grip", attr: { title: "拖动缩放" } });
    grip.addEventListener("pointerdown", (ev) => this.startResize(ev));
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
  startResize(ev) {
    ev.preventDefault(); ev.stopPropagation();
    const r = this.el.getBoundingClientRect();
    const x0 = ev.clientX, y0 = ev.clientY, w0 = r.width, h0 = r.height;
    this.el.addClass("is-resizing");
    const move = (e) => {
      this.el.style.width = `${clamp(Math.round(w0 + e.clientX - x0), 360, 1400)}px`;
      this.el.style.height = `${clamp(Math.round(h0 + e.clientY - y0), 320, 1200)}px`;
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

    this.dateEl.empty();
    this.dateEl.createSpan({ cls: "gd-float-day", text: `${dateShort(this.key)} ${weekdayCN(this.key)}` });
    const nav = this.dateEl.createDiv({ cls: "gd-float-nav" });
    const nb = (t, tt, fn) => { const x = nav.createEl("button", { text: t, cls: "gd-float-mini", attr: { title: tt } }); x.onclick = fn; };
    nb("‹", "前一天", () => this.load(shiftDate(this.key, -1)));
    nb("今天", "回到今天", () => this.load(todayStr()));
    nb("›", "后一天", () => this.load(shiftDate(this.key, 1)));
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
      this.plugin.notifyRefresh();
    } catch (e) { console.error("[格间日记] 悬浮窗保存失败", e); }
  }
  refresh(key) {
    if (!this.el) return;
    if (key && splitDayKey(key).date !== splitDayKey(this.key).date) this.load(key);
    else this.load(this.key);
  }
}

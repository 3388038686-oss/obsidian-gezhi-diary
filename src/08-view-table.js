/* ============================================================
 * 表格视图（B6）：左目录 + 右表格
 *  - 左边是日记清单（点了跳到那一天）
 *  - 右边把这一天的每格拆成一行：格子名 | 内容 | 贴纸
 *  - 内容走 Markdown，所以图片、动图都能显示
 *  - 五款皮肤可选（写在 layout.skin 上，跟九宫格共用）
 * ============================================================ */

class TableView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.key = "";
    this.date = "";
    this.cells = [];
    this.h1 = "";
    this.file = null;
    this.previewMode = true;
    this.el = null;
    this.dirEl = null;
    this.tblEl = null;
  }

  getViewType() { return VIEW_TABLE; }
  getDisplayText() { return "日记表格"; }
  getIcon() { return "table"; }
  getState() { return { key: this.key }; }
  async setState(st) { if (st && st.key) this.pendingKey = st.key; }

  async onOpen() {
    this.contentEl.addClass("gd-root");
    this.contentEl.addClass("gd-table-root");
    if (IS_MOBILE) this.contentEl.addClass("is-mobile");
    this.build();
    await this.openKey(this.pendingKey || todayStr());
  }

  build() {
    const el = this.contentEl;
    el.empty();
    this.el = el;

    const top = el.createDiv({ cls: "gd-tbl-top" });
    const ttl = top.createDiv({ cls: "gd-tbl-title" });
    ttl.createEl("strong", { text: this.key || "表格" });
    ttl.createSpan({ cls: "gd-tbl-sub", text: "" });
    const acts = top.createDiv({ cls: "gd-tbl-acts" });
    const mk = (txt, tip, fn) => {
      const b = acts.createEl("button", { cls: "gd-tbtn", text: txt, attr: { title: tip } });
      b.onclick = fn;
    };
    mk("‹", "前一天", () => this.openKey(shiftDate(this.date || todayStr(), -1)));
    mk("今天", "回到今天", () => this.openKey(todayStr()));
    mk("›", "后一天", () => this.openKey(shiftDate(this.date || todayStr(), 1)));
    mk("皮肤", "换表格样式", (e) => this.skinMenu(e));
    mk("进格子", "用九宫格打开这一天", () => this.plugin.openDay(this.key));

    const body = el.createDiv({ cls: "gd-tbl-body" });
    this.dirEl = body.createDiv({ cls: "gd-tbl-dir" });
    this.tblEl = body.createDiv({ cls: "gd-tbl-main" });
  }

  async openKey(key) {
    const s = this.plugin.settings;
    this.key = key || todayStr();
    const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(this.key);
    this.date = dm ? dm[0] : todayStr();
    const folder = normalizePath(s.rootFolder || "日记");
    const path = `${folder}/${this.key}.md`;
    const f = this.app.vault.getAbstractFileByPath(path);
    this.file = f instanceof TFile ? f : null;
    if (this.file) {
      const raw = await this.app.vault.cachedRead(this.file);
      const parsed = parseDay(raw, s.headingLevel || 2);
      this.cells = normalizeCells(parsed.cells, parsed.layout, s);
      this.h1 = parsed.h1;
      this.layout = parsed.layout || {};
    } else {
      this.cells = [];
      this.h1 = this.key;
      this.layout = {};
    }
    if (this.el) {
      const t = this.el.querySelector(".gd-tbl-title strong");
      if (t) t.setText(this.key);
      const sub = this.el.querySelector(".gd-tbl-sub");
      if (sub) sub.setText(`${weekdayCN(this.date)} · ${this.cells.length} 格 · ${this.cells.reduce((n, c) => n + (c.content || "").length, 0)} 字`);
    }
    this.renderDir();
    await this.renderTable();
  }

  renderDir() {
    const el = this.dirEl;
    if (!el) return;
    el.empty();
    const files = this.plugin.dayFiles();
    const head = el.createDiv({ cls: "gd-tbl-dir-head" });
    head.createSpan({ text: "日记" });
    head.createSpan({ cls: "gd-side-count", text: String(files.length) });
    const list = el.createDiv({ cls: "gd-tbl-dir-list" });
    for (const f of files.slice(0, 400)) {
      const k = f.basename;
      const row = list.createDiv({ cls: "gd-tbl-dir-item" + (k === this.key ? " is-active" : "") });
      row.createSpan({ cls: "gd-tbl-dir-date", text: dateShort(k) });
      const sfx = splitDayKey(k).suffix;
      row.createSpan({ cls: "gd-tbl-dir-sfx", text: sfx ? "第" + sfx + "篇" : "" });
      row.onclick = () => this.openKey(k);
    }
  }

  async renderTable() {
    const el = this.tblEl;
    if (!el) return;
    el.empty();
    const s = this.plugin.settings;
    const skin = (this.layout && this.layout.skin) || s.skin || "zebra";
    const table = el.createEl("table", { cls: "gd-table gd-tbl-sheet" });
    table.setAttr("data-skin", s.glassEnabled ? "glass" : skin);

    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    for (const h of ["格子", "内容", "贴纸"]) hr.createEl("th", { text: h });

    const tbody = table.createEl("tbody");
    if (!this.cells.length) {
      const tr = tbody.createEl("tr");
      const td = tr.createEl("td", { text: "这一天还没有日记" });
      td.colSpan = 3;
      td.addClass("gd-tbl-empty");
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const tr = tbody.createEl("tr");
      if (c.accent) tr.style.setProperty("--gd-cell-accent", c.accent);

      const tdT = tr.createEl("td", { cls: "gd-tbl-title-cell" });
      tdT.createSpan({ cls: "gd-tbl-idx", text: String(i + 1) });
      tdT.createSpan({ cls: "gd-tbl-name", text: c.title || "（无标题）" });

      const tdC = tr.createEl("td", { cls: "gd-tbl-content-cell" });
      if (this.previewMode) {
        const pv = tdC.createDiv({ cls: "gd-cell-preview gd-tbl-preview" });
        if ((c.content || "").trim()) {
          await this.renderMarkdown(pv, c.content);
          this.bindImages(pv);
        } else {
          pv.createSpan({ cls: "gd-tbl-ph", text: "（空）" });
        }
        pv.ondblclick = () => this.editCell(c, tdC);
      } else {
        const ta = tdC.createEl("textarea", { cls: "gd-cell-editor gd-tbl-ta" });
        ta.value = c.content || "";
        ta.oninput = () => { c.content = ta.value; this.scheduleSave(); };
      }

      const tdS = tr.createEl("td", { cls: "gd-tbl-sticker-cell" });
      tdS.setText(c.sticker || "—");
    }

    /* 底部工具条 */
    const foot = el.createDiv({ cls: "gd-tbl-foot" });
    foot.createSpan({ cls: "gd-tbl-status", text: this.saving ? "保存中…" : "已保存" });
    const b1 = foot.createEl("button", { cls: "gd-mini-btn", text: this.previewMode ? "改文字" : "看排版" });
    b1.onclick = () => { this.previewMode = !this.previewMode; this.renderTable(); };
    const b2 = foot.createEl("button", { cls: "gd-mini-btn", text: "导出为表格" });
    b2.onclick = () => this.exportMarkdown();
  }

  async renderMarkdown(el, md) {
    try {
      if (MarkdownRenderer && MarkdownRenderer.render) {
        await MarkdownRenderer.render(this.app, md, el, this.file ? this.file.path : "", this);
      } else {
        await MarkdownRenderer.renderMarkdown(md, el, this.file ? this.file.path : "", this);
      }
    } catch (e) {
      el.createEl("pre", { text: md });
    }
  }

  /* 预览里的图片：拖动改宽（和九宫格同一套：写回 |宽） */
  bindImages(root) {
    const imgs = root.querySelectorAll("img");
    for (const img of imgs) {
      img.addClass("gd-cell-img-el");
      img.onpointerdown = (e) => {
        const startX = e.clientX;
        const startW = img.getBoundingClientRect().width;
        let skip = false;
        const move = (ev) => {
          const w = clamp(Math.round(startW + (ev.clientX - startX)), 40, 900);
          img.style.width = w + "px";
          skip = true;
        };
        const up = () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          if (skip) e.preventDefault();
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      };
    }
  }

  editCell(cell, td) {
    td.empty();
    const ta = td.createEl("textarea", { cls: "gd-cell-editor gd-tbl-ta" });
    ta.value = cell.content || "";
    ta.oninput = () => { cell.content = ta.value; this.scheduleSave(); };
    ta.focus();
    ta.onblur = () => this.renderTable();
  }

  scheduleSave() {
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(() => this.saveNow(), 700);
  }

  async saveNow() {
    if (!this.file) return;
    if (this._t) { clearTimeout(this._t); this._t = null; }
    this.saving = true;
    try {
      const s = this.plugin.settings;
      const old = await this.app.vault.read(this.file);
      const next = serializeDay(this.date, this.cells, {
        fm: parseDay(old).fm,
        h1: this.h1,
        columns: (this.layout && this.layout.cols) || s.columns || 2,
        level: s.headingLevel || 2,
        border: (this.layout && this.layout.border) || s.defaultBorder || "hair",
        skin: (this.layout && this.layout.skin) || s.skin,
        cover: (this.layout && this.layout.cover) || "",
        coverHeight: (this.layout && this.layout.coverHeight) || s.coverHeight,
        layers: (this.layout && this.layout.layers) || null,
      });
      if (next !== old) await this.app.vault.modify(this.file, next);
      this.plugin.notifyRefresh();
    } catch (e) {
      new Notice("表格保存失败：" + (e && e.message ? e.message : e));
    } finally {
      this.saving = false;
      const st = this.el && this.el.querySelector(".gd-tbl-status");
      if (st) st.setText("已保存");
    }
  }

  skinMenu(evt) {
    const m = new Menu();
    for (const [id, name] of TABLE_SKINS) {
      m.addItem((i) => i.setTitle(name).setChecked(((this.layout && this.layout.skin) || "") === id)
        .onClick(async () => {
          this.layout = this.layout || {};
          this.layout.skin = id;
          await this.saveNow();
          this.renderTable();
        }));
    }
    const e = evt && evt.clientX != null ? evt : { clientX: window.innerWidth - 200, clientY: 120 };
    showMenuAt(m, e);
  }

  /* 导出成 Markdown 表格（可以直接粘到别处） */
  exportMarkdown() {
    const rows = ["| 格子 | 内容 | 贴纸 |", "| --- | --- | --- |"];
    for (const c of this.cells) {
      const body = (c.content || "").replace(/\n+/g, "<br>").replace(/\|/g, "\\|");
      rows.push(`| ${(c.title || "").replace(/\|/g, "\\|")} | ${body} | ${c.sticker || ""} |`);
    }
    const md = rows.join("\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md);
        new Notice("表格已复制到剪贴板");
      } else {
        new Notice("当前环境不能复制，已输出到控制台");
        console.log(md);
      }
    } catch (e) { console.log(md); new Notice("已输出到控制台"); }
  }

  onClose() { if (this._t) clearTimeout(this._t); }
}

/* ============================================================
 * 时间线：竖轴 + 左右错开 + 严格按日期过滤
 *  - TimelinePanel：真正的画面（标签页和悬浮窗共用同一套）
 *  - TimelineView ：只负责占一个 Obsidian 标签页，把面板塞进去
 *  - 悬浮窗在 09-plugin.js 里用 openTimelineFloat() 直接建 div，可多开
 * ============================================================ */

class TimelinePanel {
  constructor(plugin, opts) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.opts = opts || {};
    this.inFloat = !!this.opts.float;
    this.el = null;
    this.listEl = null;
    this.range = 90;
    this.keyword = "";
    this.expanded = new Set();
    this.activeKey = "";
    this.followDay = true;
    this.dayFilter = "";
    this.renderDebounced = debounce(() => this.render(), 120);
    this.dead = false;
  }

  openInPane(container) {
    this.el = container;
    container.empty();
    container.addClass("gd-root");
    container.addClass("gd-timeline-root");
    if (this.inFloat) container.addClass("is-float");
    if (IS_MOBILE) container.addClass("is-mobile");
    this.build();
    this.render();
  }

  close() {
    this.dead = true;
    this.renderDebounced.cancel();
  }

  refresh() {
    if (this.dead) return;
    this.build();
    this.render();
  }

  setActive(key) {
    this.activeKey = key || "";
    if (this.followDay) this.refresh();
  }

  build() {
    const el = this.el;
    if (!el) return;
    el.empty();

    const top = el.createDiv({ cls: "gd-tl-top" });
    const tline = top.createDiv({ cls: "gd-tl-titlebar" });
    tline.createEl("h4", { text: this.focusDate() ? "这一天的记录" : "时间线" });

    const acts = top.createDiv({ cls: "gd-tl-acts" });
    const sel = acts.createEl("select", { cls: "gd-select" });
    for (const [v, n] of [["30", "近 30 天"], ["90", "近 90 天"], ["0", "全部"]]) sel.createEl("option", { text: n, attr: { value: v } });
    sel.value = String(this.range);
    sel.onchange = () => { this.range = Number(sel.value); this.render(); };
    const mkBtn = (txt, title, fn, on) => {
      const b = acts.createEl("button", { cls: "gd-tbtn" + (on ? " is-on" : ""), text: txt, attr: { title } });
      b.onclick = fn;
      return b;
    };
    mkBtn("跟随当天", "只看主视图当前这一天（默认开）", () => {
      this.followDay = !this.followDay;
      this.build(); this.render();
    }, this.followDay);
    mkBtn("看全部", "不跟随，列出范围内的全部日期", () => {
      this.followDay = false; this.dayFilter = "";
      this.build(); this.render();
    }, !this.followDay);
    mkBtn("撤销", "撤销上一次改动", () => this.plugin.history.undo());
    mkBtn("重做", "重做", () => this.plugin.history.redo());

    const search = el.createDiv({ cls: "gd-side-search" });
    const si = search.createEl("input", { cls: "gd-side-search-input", attr: { type: "search", placeholder: "搜索日期 / 内容…" } });
    si.value = this.keyword;
    si.addEventListener("input", () => { this.keyword = si.value.trim(); this.renderDebounced(); });

    this.listEl = el.createDiv({ cls: "gd-tl-list" });
    if (!this.inFloat) el.createDiv({ cls: "gd-tl-note", text: "每次改动前自动留版本；点开任意一天可查看 / 恢复历史内容。" });
  }

  /* 严格取「当前这一天」：点哪天就只出哪天，绝不掺别的日期 */
  focusDate() {
    if (!this.followDay || !this.activeKey) return this.dayFilter || "";
    return splitDayKey(this.activeKey).date || this.dayFilter || "";
  }

  firstImg(cells) {
    for (const c of cells || []) {
      const m = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/.exec(c.content || "");
      if (!m) continue;
      const src = (m[1] || m[2] || "").trim();
      if (!src) continue;
      const url = this.plugin.thumbUrl ? this.plugin.thumbUrl(src) : "";
      if (url) return { url, name: src };
    }
    return null;
  }

  groupByDate(files) {
    const map = new Map();
    for (const f of files) {
      const { date, suffix } = splitDayKey(f.basename);
      const d = date || f.basename;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push({ file: f, suffix });
    }
    const list = [...map.entries()].map(([date, items]) => {
      items.sort((a, b) => {
        const va = cnValue(a.suffix), vb = cnValue(b.suffix);
        return (Number.isFinite(va) ? va : -1) - (Number.isFinite(vb) ? vb : -1);
      });
      return { date, items };
    });
    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }

  async render() {
    if (!this.listEl || this.dead) return;
    const kw = this.keyword.toLowerCase();
    const focus = this.focusDate();
    let files;
    if (focus) {
      files = this.plugin.dayFiles().filter((f) => splitDayKey(f.basename).date === focus);
    } else {
      const cutoff = this.range > 0 ? shiftDate(todayStr(), -this.range) : "";
      files = this.plugin.dayFiles().filter((f) => !cutoff || f.basename >= cutoff);
    }

    this.listEl.empty();
    this.listEl.removeClass("is-axis");
    this.listEl.addClass("is-single");

    const shownDay = focus || "";
    if (shownDay) {
      const bar = this.listEl.createDiv({ cls: "gd-tl-focus" });
      const dk = dayKind(shownDay);
      const tag = dk.kind === "holiday" ? ` · ${dk.name || "节假日"}` : dk.kind === "weekend" ? " · 周末" : "";
      bar.createSpan({ text: "只看 " + dateCN(shownDay) + tag + " · 共 " + files.length + " 篇" });
      const all2 = bar.createEl("button", { text: "看全部日期", cls: "gd-mini-btn" });
      all2.onclick = () => { this.followDay = false; this.dayFilter = ""; this.build(); this.render(); };
    }

    const groups = this.groupByDate(files);
    let shown = 0;
    let year = "";
    for (const g of groups) {
      const parts = [];
      for (const it of g.items) {
        try {
          const parsed = parseDay(await this.app.vault.cachedRead(it.file));
          parts.push({ it, parsed, text: parsed.cells.map((c) => `${c.title} ${c.content}`).join("\n") });
        } catch (e) { /* ignore */ }
      }
      const allText = parts.map((p) => p.text).join("\n");
      if (kw && !(g.date.includes(kw) || allText.toLowerCase().includes(kw))) continue;
      shown++;

      const y = g.date.slice(0, 4);
      if (y !== year) {
        year = y;
        const yb = this.listEl.createDiv({ cls: "gd-tl-year" });
        yb.createSpan({ cls: "gd-tl-year-num", text: y });
        yb.createSpan({ cls: "gd-tl-year-cn", text: cnYearLabel(y) });
      }

      const row = this.listEl.createDiv({ cls: "gd-tl-row" });
      row.createDiv({ cls: "gd-tl-node" });

      const card = row.createDiv({ cls: "gd-tl-card" });
      const dk = dayKind(g.date);
      if (dk.kind === "holiday") card.addClass("is-holiday");
      else if (dk.kind === "weekend") card.addClass("is-weekend");

      const head = card.createDiv({ cls: "gd-tl-head" });
      const db = head.createDiv({ cls: "gd-tl-datebox" });
      db.createEl("strong", { text: dateShort(g.date) });
      db.createEl("span", { text: `${weekdayCN(g.date)} · ${g.items.length} 篇 · ${allText.replace(/\s/g, "").length} 字` });
      if (dk.kind === "holiday" && dk.name) db.createEl("i", { cls: "gd-tl-holiday", text: dk.name });
      /* 整行点一下就开这一天的浮窗（手机上不用长按右键） */
      row.setAttribute("title", "点一下：打开这一天的浮窗");
      row.onclick = () => {
        if (this.inFloat) return;             /* 浮窗里再点不再套娃 */
        this.plugin.openTimelineFloat(g.date);
      };
      const btns = head.createDiv({ cls: "gd-tl-head-btns" });
      const anyKey = g.items[0] ? g.items[0].file.basename : "";
      btns.createEl("button", { text: this.expanded.has(g.date) ? "收起" : "详情", cls: "gd-mini-btn" }).onclick = (e) => {
        e.stopPropagation();
        if (this.expanded.has(g.date)) this.expanded.delete(g.date); else this.expanded.add(g.date);
        this.render();
      };
      btns.createEl("button", { text: "打开", cls: "gd-mini-btn" }).onclick = (e) => { e.stopPropagation(); this.plugin.openDay(anyKey); };
      btns.createEl("button", { text: "版本", cls: "gd-mini-btn" }).onclick = (e) => {
        e.stopPropagation();
        const f = g.items[0] && g.items[0].file;
        if (f) new SnapshotModal(this.app, this.plugin, f).open();
      };

      let img = null;
      for (const p of parts) { const hit = this.firstImg(p.parsed.cells); if (hit) { img = hit; break; } }
      const mainBox = card.createDiv({ cls: "gd-tl-mainbox" });
      if (img) {
        const thumb = mainBox.createDiv({ cls: "gd-tl-thumb" });
        thumb.style.backgroundImage = `url("${img.url}")`;
        thumb.setAttribute("title", img.name);
        thumb.onclick = (e) => { e.stopPropagation(); this.plugin.openDay(anyKey); };
      }
      mainBox.createDiv({ cls: "gd-tl-sum", text: truncate(allText.replace(/\n+/g, " · "), 110) || "（空）" });

      try {
        const f0 = g.items[0] && g.items[0].file;
        if (f0) {
          const snaps = await this.plugin.history.list(f0);
          if (snaps.length) {
            const sr = card.createDiv({ cls: "gd-tl-snaps-line" });
            sr.createSpan({ text: `改过 ${snaps.length} 次 · 最近 ${snaps[0].time}` });
            const hb = sr.createEl("button", { text: "看修改", cls: "gd-mini-btn" });
            hb.onclick = () => new SnapshotModal(this.app, this.plugin, f0).open();
          }
        }
      } catch (e) { /* ignore */ }

      if (this.expanded.has(g.date)) {
        const box = card.createDiv({ cls: "gd-tl-detail" });
        for (const p of parts) {
          const tag = p.it.suffix ? "第 " + p.it.suffix + " 篇" : "主篇";
          const r = box.createDiv({ cls: "gd-tl-cell" });
          r.createEl("strong", { text: tag });
          r.createSpan({ text: truncate(p.parsed.cells.map((c) => c.title).join(" / "), 60) });
          const open2 = r.createEl("button", { text: "打开", cls: "gd-mini-btn" });
          open2.onclick = (e) => { e.stopPropagation(); this.plugin.openDay(p.it.file.basename); };
        }
      }
    }

    if (!shown) {
      this.listEl.createDiv({
        cls: "gd-empty",
        text: kw ? "没有匹配的日记" : (shownDay ? "这一天还没有日记，去写一篇吧" : "这个范围内没有日记"),
      });
    }
  }
}

/* 标签页宿主：一个标签页一份面板 */
class TimelineView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.panel = null;
  }
  getViewType() { return VIEW_TIMELINE; }
  getDisplayText() { return "日记时间线"; }
  getIcon() { return ICON_TIMELINE; }

  async onOpen() {
    if (!this.panel) this.panel = new TimelinePanel(this.plugin, { float: false });
    this.panel.openInPane(this.contentEl);
    this.plugin.registerTimelinePanel(this.panel);
  }
  onClose() {
    if (this.panel) { this.plugin.unregisterTimelinePanel(this.panel); this.panel.close(); }
  }

  /* 兼容旧调用 */
  setActive(key) { if (this.panel) this.panel.setActive(key); }
  refresh() { if (this.panel) this.panel.refresh(); }
  render() { if (this.panel) this.panel.render(); }
}
